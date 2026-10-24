// Alerta de temperatura alta via WhatsApp.
// Dispara uma mensagem a cada leitura acima do limite. A primeira avisa que o
// limite foi ultrapassado; as seguintes avisam que a temperatura continua alta,
// até que ela volte para baixo do limite.

import { enviarMensagem } from "./whatsapp.js";

export const LIMITE_C = Number(process.env.ALERTA_LIMITE_C) || 8;

interface Leitura {
  valor: number;
  unidade: "C" | "F" | "K";
  sensor?: string;
  dataHora: string;
}

// Sensores que estão acima do limite -> horário da primeira leitura acima do limite
const emAlerta = new Map<string, string>();

function chaveSensor(sensor?: string): string {
  return sensor ?? "(sem sensor)";
}

function formatarHorario(dataHora: string): string {
  return new Date(dataHora).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export function paraCelsius(valor: number, unidade: Leitura["unidade"]): number {
  if (unidade === "F") return ((valor - 32) * 5) / 9;
  if (unidade === "K") return valor - 273.15;
  return valor;
}

// Recupera o estado a partir do histórico, para que a próxima mensagem após
// reiniciar saiba desde quando a temperatura está acima do limite
export function inicializarAlertas(historico: Leitura[]): void {
  for (const t of historico) {
    const chave = chaveSensor(t.sensor);
    const celsius = paraCelsius(t.valor, t.unidade);
    if (celsius < LIMITE_C) emAlerta.delete(chave);
    else if (celsius > LIMITE_C && !emAlerta.has(chave)) emAlerta.set(chave, t.dataHora);
  }
}

// Avalia cada nova leitura e dispara o alerta enquanto estiver acima do limite
export function verificarTemperatura(leitura: Leitura): void {
  const chave = chaveSensor(leitura.sensor);
  const celsius = paraCelsius(leitura.valor, leitura.unidade);

  if (celsius < LIMITE_C) {
    emAlerta.delete(chave); // temperatura normalizada
    return;
  }
  if (celsius === LIMITE_C) return;

  const desde = emAlerta.get(chave);
  if (!desde) emAlerta.set(chave, leitura.dataHora);

  const sensor = leitura.sensor ? ` no sensor "${leitura.sensor}"` : "";
  const titulo = desde
    ? `⚠️ Temperatura continua acima do limite${sensor}!`
    : `⚠️ Alerta de temperatura${sensor}!`;
  const texto =
    `${titulo}\n` +
    `Leitura: ${leitura.valor}${leitura.unidade === "K" ? " K" : `°${leitura.unidade}`}` +
    ` (limite: ${LIMITE_C}°C)\n` +
    `Horário: ${formatarHorario(leitura.dataHora)}` +
    (desde ? `\nAcima do limite desde: ${formatarHorario(desde)}` : "");

  enviarMensagem(texto)
    .then(() => console.log(`[alerta] Mensagem enviada (${chave}: ${leitura.valor}${leitura.unidade})`))
    .catch((erro) => console.error("[alerta] Falha ao enviar mensagem:", erro.message));
}
