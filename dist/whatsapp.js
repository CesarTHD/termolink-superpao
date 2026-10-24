// Conexão com o WhatsApp via Baileys (WhatsApp Web).
// A sessão fica salva em ./whatsapp-auth e o número de disparo em ./whatsapp-config.json.
import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState, } from "baileys";
import fs from "fs";
import path from "path";
import pino from "pino";
import QRCode from "qrcode";
const PASTA_AUTH = path.join(process.cwd(), "whatsapp-auth");
const ARQUIVO_CONFIG = path.join(process.cwd(), "whatsapp-config.json");
let sock = null;
let estado = "desconectado";
let qrDataUrl = null;
let conta = null; // número do WhatsApp conectado
let ultimoErro = null;
let numeroDestino = carregarConfig().numeroDestino ?? "";
function carregarConfig() {
    if (!fs.existsSync(ARQUIVO_CONFIG))
        return {};
    return JSON.parse(fs.readFileSync(ARQUIVO_CONFIG, "utf-8"));
}
export function statusWhatsApp() {
    return { estado, qr: qrDataUrl, conta, numeroDestino, erro: ultimoErro };
}
export function definirNumeroDestino(numero) {
    const digitos = numero.replace(/\D/g, "");
    if (digitos.length < 10 || digitos.length > 15) {
        throw new Error("Informe o número com DDI e DDD, ex.: 5511999999999.");
    }
    numeroDestino = digitos;
    fs.writeFileSync(ARQUIVO_CONFIG, JSON.stringify({ numeroDestino }, null, 2));
    return numeroDestino;
}
export async function conectar() {
    if (sock)
        return; // já conectado ou conectando
    estado = "conectando";
    ultimoErro = null;
    const { state, saveCreds } = await useMultiFileAuthState(PASTA_AUTH);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
    const socket = makeWASocket({
        auth: state,
        version,
        logger: pino({ level: "silent" }),
        browser: ["API Temperaturas", "Chrome", "1.0"],
        markOnlineOnConnect: false,
    });
    sock = socket;
    socket.ev.on("creds.update", saveCreds);
    socket.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
        if (sock !== socket)
            return; // evento de um socket antigo
        if (qr) {
            estado = "aguardando_qr";
            qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 280 });
        }
        if (connection === "open") {
            estado = "conectado";
            qrDataUrl = null;
            conta = socket.user?.id.split(":")[0].split("@")[0] ?? null;
            console.log(`[whatsapp] Conectado como ${conta}`);
        }
        if (connection === "close") {
            const codigo = lastDisconnect?.error?.output?.statusCode;
            sock = null;
            qrDataUrl = null;
            conta = null;
            if (codigo === DisconnectReason.loggedOut) {
                // Sessão encerrada pelo celular: apaga as credenciais e espera nova conexão
                fs.rmSync(PASTA_AUTH, { recursive: true, force: true });
                estado = "desconectado";
                ultimoErro = "Sessão encerrada pelo celular. Conecte novamente.";
                console.log("[whatsapp] Sessão encerrada pelo celular");
            }
            else if (estado === "aguardando_qr" && codigo === DisconnectReason.timedOut) {
                // QR code expirou sem ser lido: não fica tentando para sempre
                estado = "desconectado";
                ultimoErro = "O QR code expirou. Clique em Conectar para gerar outro.";
            }
            else {
                // Queda de conexão ou reinício pedido pelo WhatsApp (normal após ler o QR)
                estado = "conectando";
                console.log(`[whatsapp] Conexão fechada (código ${codigo}), reconectando…`);
                setTimeout(() => conectar().catch(registrarErro), 3000);
            }
        }
    });
}
export async function desconectar() {
    const socket = sock;
    sock = null;
    estado = "desconectado";
    qrDataUrl = null;
    conta = null;
    ultimoErro = null;
    if (socket) {
        await socket.logout().catch(() => socket.end(undefined));
    }
    fs.rmSync(PASTA_AUTH, { recursive: true, force: true });
}
export async function enviarMensagem(texto) {
    if (!sock || estado !== "conectado")
        throw new Error("WhatsApp não está conectado.");
    if (!numeroDestino)
        throw new Error("Número de disparo não configurado.");
    // Pergunta ao WhatsApp o ID correto do número (resolve o 9º dígito de celulares BR)
    const [resultado] = (await sock.onWhatsApp(numeroDestino)) ?? [];
    if (!resultado?.exists)
        throw new Error(`O número ${numeroDestino} não tem WhatsApp.`);
    await sock.sendMessage(resultado.jid, { text: texto });
}
function registrarErro(erro) {
    ultimoErro = erro.message;
    if (!sock)
        estado = "desconectado";
    console.error("[whatsapp] Erro:", erro.message);
}
// Reconecta automaticamente ao iniciar se já houver uma sessão salva
if (fs.existsSync(path.join(PASTA_AUTH, "creds.json"))) {
    conectar().catch(registrarErro);
}
