#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <math.h>

#define PIN_NTC 32

// =========================
// WIFI
// =========================

const char* WIFI_SSID = "Cesar THD Oi Fibra";
const char* WIFI_SENHA = "cjhesoyam";

// IP DO COMPUTADOR QUE RODA A API
const char* API_URL =
  "http://192.168.1.21:3000/temperaturas";

// Nome do sensor enviado para a API
const char* SENSOR_NOME = "esp32-ntc";


// =========================
// NTC
// =========================

const float VCC = 3.3;
const float R_FIXO = 10000.0;

const float R0 = 10000.0;
const float TEMP_REFERENCIA_K = 25.0 + 273.15;
const float BETA = 3950.0;


// =========================
// CONECTAR WIFI
// =========================

void conectarWiFi() {

  Serial.print("Conectando ao WiFi");

  WiFi.begin(WIFI_SSID, WIFI_SENHA);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.println("WiFi conectado!");

  Serial.print("IP do ESP32: ");
  Serial.println(WiFi.localIP());
}


// =========================
// LER TEMPERATURA
// =========================

float lerTemperatura() {

  const int amostras = 20;

  uint32_t soma = 0;

  for (int i = 0; i < amostras; i++) {
    soma += analogRead(PIN_NTC);
    delay(5);
  }

  float adc = soma / (float)amostras;

  if (adc <= 0 || adc >= 4095) {
    return NAN;
  }

  float tensao =
      adc * VCC / 4095.0;

  float resistenciaNTC =
      R_FIXO * tensao /
      (VCC - tensao);

  float temperaturaK =
      1.0 /
      (
        (1.0 / TEMP_REFERENCIA_K) +
        (1.0 / BETA) *
        log(resistenciaNTC / R0)
      );

  return temperaturaK - 273.15;
}


// =========================
// ENVIAR PARA API
// =========================

void enviarTemperatura(float temperatura) {

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi desconectado.");
    conectarWiFi();
  }

  HTTPClient http;

  http.begin(API_URL);

  http.addHeader(
    "Content-Type",
    "application/json"
  );

  // Formato esperado pela API:
  // { "valor": number, "unidade": "C", "sensor": string }
  String json =
      "{\"valor\":" +
      String(temperatura, 2) +
      ",\"unidade\":\"C\"" +
      ",\"sensor\":\"" + String(SENSOR_NOME) + "\"" +
      "}";

  Serial.print("Enviando: ");
  Serial.println(json);

  int status = http.POST(json);

  if (status > 0) {

    Serial.print("HTTP Status: ");
    Serial.println(status);

    String resposta =
        http.getString();

    Serial.print("Resposta: ");
    Serial.println(resposta);

  } else {

    Serial.print("Erro HTTP: ");
    Serial.println(status);

  }

  http.end();
}


// =========================
// SETUP
// =========================

void setup() {

  Serial.begin(115200);

  analogReadResolution(12);

  conectarWiFi();

  Serial.println();
  Serial.println("Sensor iniciado.");
}


// =========================
// LOOP
// =========================

void loop() {

  float temperatura =
      lerTemperatura();

  if (isnan(temperatura)) {

    Serial.println(
      "Erro ao ler temperatura."
    );

  } else {

    Serial.print("Temperatura: ");
    Serial.print(temperatura, 2);
    Serial.println(" °C");

    enviarTemperatura(
      temperatura
    );
  }

  // envia a cada 10 segundos
  delay(10000);
}