import "./env.js";
import express, { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { inicializarAlertas, LIMITE_C, verificarTemperatura } from "./alerta.js";
import { conectar, definirNumeroDestino, desconectar, enviarMensagem, statusWhatsApp } from "./whatsapp.js";

interface Temperatura {
  id: number;
  valor: number;
  unidade: "C" | "F" | "K";
  sensor?: string;
  dataHora: string;
}

const PORTA = Number(process.env.PORT) || 3000;
const ARQUIVO_DADOS = path.join(process.cwd(), "temperaturas.json");
const UNIDADES = ["C", "F", "K"] as const;

// Carrega as temperaturas salvas em disco (se existirem)
function carregar(): Temperatura[] {
  if (!fs.existsSync(ARQUIVO_DADOS)) return [];
  return JSON.parse(fs.readFileSync(ARQUIVO_DADOS, "utf-8"));
}

function salvar(): void {
  fs.writeFileSync(ARQUIVO_DADOS, JSON.stringify(temperaturas, null, 2));
}

const temperaturas: Temperatura[] = carregar();
let proximoId = temperaturas.reduce((max, t) => Math.max(max, t.id), 0) + 1;
inicializarAlertas(temperaturas);

const app = express();
app.use(express.json());

// Serve o painel com o gráfico (public/index.html) em http://localhost:3000/
app.use(express.static(path.join(process.cwd(), "public")));

// Registra uma nova temperatura
app.post("/temperaturas", (req: Request, res: Response) => {
  const { valor, unidade = "C", sensor, dataHora } = req.body ?? {};

  

  if (typeof valor !== "number" || !Number.isFinite(valor)) {
    return res.status(400).json({ erro: "O campo 'valor' é obrigatório e deve ser numérico." });
  }
  if (!UNIDADES.includes(unidade)) {
    return res.status(400).json({ erro: "O campo 'unidade' deve ser 'C', 'F' ou 'K'." });
  }
  if (sensor !== undefined && typeof sensor !== "string") {
    return res.status(400).json({ erro: "O campo 'sensor' deve ser texto." });
  }
  if (dataHora !== undefined && isNaN(Date.parse(dataHora))) {
    return res.status(400).json({ erro: "O campo 'dataHora' deve ser uma data válida (ISO 8601)." });
  }

  const nova: Temperatura = {
    id: proximoId++,
    valor,
    unidade,
    sensor,
    dataHora: dataHora ? new Date(dataHora).toISOString() : new Date().toISOString(),
  };

  temperaturas.push(nova);
  salvar();
  verificarTemperatura(nova);
  res.status(201).json(nova);
});

// Lista temperaturas (filtro opcional: ?sensor=nome)
app.get("/temperaturas", (req: Request, res: Response) => {
  const { sensor } = req.query;
  const resultado = sensor ? temperaturas.filter((t) => t.sensor === sensor) : temperaturas;
  res.json(resultado);
});

// Estatísticas das temperaturas (filtro opcional: ?sensor=nome&unidade=C)
app.get("/temperaturas/estatisticas", (req: Request, res: Response) => {
  const { sensor, unidade = "C" } = req.query;
  const lista = temperaturas.filter(
    (t) => t.unidade === unidade && (!sensor || t.sensor === sensor)
  );

  if (lista.length === 0) {
    return res.json({ quantidade: 0 });
  }

  const valores = lista.map((t) => t.valor);
  res.json({
    unidade,
    quantidade: valores.length,
    minima: Math.min(...valores),
    maxima: Math.max(...valores),
    media: Number((valores.reduce((a, b) => a + b, 0) / valores.length).toFixed(2)),
    ultima: lista[lista.length - 1],
  });
});

// Busca uma temperatura pelo id
app.get("/temperaturas/:id", (req: Request, res: Response) => {
  const temp = temperaturas.find((t) => t.id === Number(req.params.id));
  if (!temp) return res.status(404).json({ erro: "Temperatura não encontrada." });
  res.json(temp);
});

// Remove uma temperatura pelo id
app.delete("/temperaturas/:id", (req: Request, res: Response) => {
  const indice = temperaturas.findIndex((t) => t.id === Number(req.params.id));
  if (indice === -1) return res.status(404).json({ erro: "Temperatura não encontrada." });
  temperaturas.splice(indice, 1);
  salvar();
  res.status(204).send();
});

// --- WhatsApp ---

const statusPainel = () => ({ ...statusWhatsApp(), limiteC: LIMITE_C });

// Estado da conexão, QR code (quando aguardando leitura) e número de disparo
app.get("/whatsapp", (_req: Request, res: Response) => {
  res.json(statusPainel());
});

app.post("/whatsapp/conectar", async (_req: Request, res: Response) => {
  await conectar().catch(() => {});
  res.json(statusPainel());
});

app.post("/whatsapp/desconectar", async (_req: Request, res: Response) => {
  await desconectar();
  res.json(statusPainel());
});

app.put("/whatsapp/numero", (req: Request, res: Response) => {
  try {
    definirNumeroDestino(String(req.body?.numero ?? ""));
    res.json(statusPainel());
  } catch (erro) {
    res.status(400).json({ erro: (erro as Error).message });
  }
});

app.post("/whatsapp/teste", async (_req: Request, res: Response) => {
  try {
    await enviarMensagem("✅ Mensagem de teste da API de temperaturas.");
    res.json({ ok: true });
  } catch (erro) {
    res.status(400).json({ erro: (erro as Error).message });
  }
});

app.listen(PORTA, () => {
  console.log(`API de temperaturas rodando em http://localhost:${PORTA}`);
});
