// Alerta de temperatura alta via WhatsApp.
// Dispara uma única mensagem quando a temperatura ultrapassa o limite e só
// volta a disparar depois que ela cair abaixo do limite e subir de novo.

import { enviarMensagem } from "./whatsapp.js";

export const LIMITE_C = Number(process.env.ALERTA_LIMITE_C) || 20;

interface Leitura {
  valor: number;
  unidade: "C" | "F" | "K";
  sensor?: string;
  dataHora: string;
}

// Sensores que estão acima do limite e já foram avisados
const emAlerta = new Set<string>();

function chaveSensor(sensor?: string): string {
  return sensor ?? "(sem sensor)";
}

export function paraCelsius(valor: number, unidade: Leitura["unidade"]): number {
  if (unidade === "F") return ((valor - 32) * 5) / 9;
  if (unidade === "K") return valor - 273.15;
  return valor;
}

// Recupera o estado a partir do histórico, para não reenviar o alerta ao reiniciar
export function inicializarAlertas(historico: Leitura[]): void {
  const ultimaPorSensor = new Map<string, Leitura>();
  for (const t of historico) ultimaPorSensor.set(chaveSensor(t.sensor), t);
  for (const [chave, t] of ultimaPorSensor) {
    if (paraCelsius(t.valor, t.unidade) > LIMITE_C) emAlerta.add(chave);
  }
}

// Avalia cada nova leitura e dispara o alerta quando necessário
export function verificarTemperatura(leitura: Leitura): void {
  const chave = chaveSensor(leitura.sensor);
  const celsius = paraCelsius(leitura.valor, leitura.unidade);

  if (celsius < LIMITE_C) {
    emAlerta.delete(chave); // rearma o alerta
    return;
  }
  if (celsius === LIMITE_C || emAlerta.has(chave)) return;

  // Marca antes de enviar para não duplicar se chegarem leituras durante o envio
  emAlerta.add(chave);

  const sensor = leitura.sensor ? ` no sensor "${leitura.sensor}"` : "";
  const horario = new Date(leitura.dataHora).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const texto =
    `⚠️ Alerta de temperatura${sensor}!\n` +
    `Leitura: ${leitura.valor}${leitura.unidade === "K" ? " K" : `°${leitura.unidade}`}` +
    ` (limite: ${LIMITE_C}°C)\n` +
    `Horário: ${horario}`;

  enviarMensagem(texto)
    .then(() => console.log(`[alerta] Mensagem enviada (${chave}: ${leitura.valor}${leitura.unidade})`))
    .catch((erro) => {
      // Desmarca para tentar de novo na próxima leitura acima do limite
      emAlerta.delete(chave);
      console.error("[alerta] Falha ao enviar mensagem:", erro.message);
    });
}
