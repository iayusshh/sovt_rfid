#include <Arduino.h>
#include <SPI.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Adafruit_PN532.h>
#include <ArduinoJson.h>
#include <esp_system.h>
#include <time.h>
#if __has_include("secrets.h")
#include "secrets.h"
#else
#include "secrets.example.h"
#endif

Adafruit_PN532 nfc(PN532_SS, &SPI);
String activeSession;
String heldUid;
unsigned long lastCardSeen = 0;
unsigned long lastHeartbeat = 0;
unsigned long lastReconnect = 0;
bool serverReady = false;
bool configured = false;
constexpr unsigned long HEARTBEAT_MS = 20000;

void led(int pin, bool on) {
  if (pin >= 0) digitalWrite(pin, on == LED_ACTIVE_HIGH ? HIGH : LOW);
}
void pulse(int pin, int count) {
  for (int i = 0; i < count; ++i) {
    led(pin, true); delay(120); led(pin, false); delay(100);
  }
}
bool clockReady() { return time(nullptr) > 1700000000; }
bool online() { return WiFi.status() == WL_CONNECTED && clockReady(); }

// Transport errors get at most one immediate retry, with identical request data.
// No pending request survives this function; there is no offline queue.
bool postJson(const char *path, const String &payload, JsonDocument &reply,
              bool transportRetry = false) {
  if (!online()) return false;
  for (int attempt = 0; attempt < (transportRetry ? 2 : 1); ++attempt) {
    if (!online()) return false;
    WiFiClientSecure secure;
    secure.setCACert(ROOT_CA);
    secure.setHandshakeTimeout(8);
    HTTPClient http;
    http.setConnectTimeout(5000);
    http.setTimeout(8000);
    http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
    if (!http.begin(secure, String(API_ORIGIN) + path)) return false;
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Authorization", String("Bearer ") + READER_TOKEN);
    if (strlen(SITES_ACCESS_TOKEN))
      http.addHeader("OAI-Sites-Authorization", String("Bearer ") + SITES_ACCESS_TOKEN);
    int code = http.POST(payload);
    String body = code > 0 ? http.getString() : String();
    http.end();
    if (code < 0) {
      Serial.println("Transport failed; attendance not confirmed.");
      if (attempt == 0 && transportRetry && online()) continue;
      return false;
    }
    if (code != 200) {
      // Do not print arbitrary response bodies: access gateways may return sensitive HTML.
      Serial.printf("Server rejected request (HTTP %d); attendance not confirmed.\n", code);
      return false;
    }
    if (body.length() > 2048 || deserializeJson(reply, body)) {
      Serial.println("Invalid server response; attendance not confirmed.");
      return false;
    }
    return true;
  }
  return false;
}
void heartbeat() {
  lastHeartbeat = millis();
  JsonDocument response;
  serverReady = postJson("/api/device/heartbeat", "{}", response);
  if (!serverReady || !response["readerId"].is<const char *>() ||
      !(response["sessionId"].isNull() || response["sessionId"].is<const char *>())) {
    serverReady = false;
    activeSession = "";
    Serial.println("Reader unavailable; check Wi-Fi, time, TLS and credentials.");
    pulse(RED_LED, 3);
    return;
  }
  activeSession = response["sessionId"].isNull() ? "" : String(response["sessionId"].as<const char *>());
  Serial.println(activeSession.length() ? "Ready: active class session." : "Idle: faculty must open a session.");
}
String eventId() {
  char value[49];
  snprintf(value, sizeof(value), "%08lx-%08lx-%08lx-%08lx", (unsigned long)esp_random(),
           (unsigned long)esp_random(), (unsigned long)esp_random(), (unsigned long)esp_random());
  return String(value);
}
void submit(const String &uid) {
  JsonDocument request;
  request["uid"] = uid;
  request["eventId"] = eventId();
  String payload;
  serializeJson(request, payload);
  JsonDocument response;
  if (!postJson("/api/device/scan", payload, response, true)) {
    serverReady = false; activeSession = "";
    Serial.println("Remove card; retap once online. Inspect roster if response was lost.");
    pulse(RED_LED, 3);
    return;
  }
  String outcome = response["outcome"] | "";
  if (outcome == "present" || outcome == "late") {
    Serial.println(String("Confirmed: ") + outcome); pulse(GREEN_LED, 1);
  } else if (outcome == "duplicate") {
    Serial.println("Confirmed duplicate: first attendance preserved."); pulse(GREEN_LED, 2);
  } else {
    Serial.println(String("Rejected: ") + (outcome.length() ? outcome : "invalid_response"));
    if (outcome == "no_session" || outcome == "disabled") { activeSession = ""; serverReady = false; }
    pulse(RED_LED, 3);
  }
}
void setup() {
  Serial.begin(115200);
  for (int pin : {GREEN_LED, RED_LED}) if (pin >= 0) { pinMode(pin, OUTPUT); led(pin, false); }
  SPI.begin(SPI_SCK, SPI_MISO, SPI_MOSI, PN532_SS);
  nfc.begin();
  if (!nfc.getFirmwareVersion() || !nfc.SAMConfig()) {
    Serial.println("PN532 not ready. Check wiring and SPI mode; restart after fixing.");
    while (true) { pulse(RED_LED, 3); delay(2000); }
  }
  nfc.setPassiveActivationRetries(0x01);
  if (DISCOVERY_ONLY) { Serial.println("UID discovery only: no attendance submissions."); return; }
  configured = strlen(WIFI_SSID) && strlen(READER_TOKEN) &&
    String(API_ORIGIN).startsWith("https://") && !String(API_ORIGIN).endsWith("/") &&
    String(ROOT_CA).indexOf("PASTE_OFFICIAL") < 0;
  if (!configured) { Serial.println("Configure secrets.h and trusted root CA before network use."); return; }
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  configTime(0, 0, "pool.ntp.org", "time.cloudflare.com");
  // Trigger a heartbeat as soon as Wi-Fi and NTP are ready.
  lastHeartbeat = millis() - HEARTBEAT_MS;
}
void loop() {
  if (!DISCOVERY_ONLY) {
    if (!configured) { delay(1000); return; }
    if (!online()) {
      serverReady = false; activeSession = "";
      if (millis() - lastReconnect >= 10000) {
        lastReconnect = millis();
        Serial.println("Offline or clock unsynchronized: no attendance submission.");
        pulse(RED_LED, 3);
        if (WiFi.status() != WL_CONNECTED) WiFi.reconnect();
      }
      delay(50); return;
    }
    if (millis() - lastHeartbeat >= HEARTBEAT_MS) heartbeat();
    if (!serverReady || !activeSession.length()) { delay(50); return; }
  }
  uint8_t uidBytes[10] = {0};
  uint8_t uidLength = 0;
  bool found = nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uidBytes, &uidLength, 150);
  if (!found) {
    if (millis() - lastCardSeen >= 600) heldUid = "";
    return;
  }
  lastCardSeen = millis();
  if (uidLength != 4 && uidLength != 7 && uidLength != 10) {
    Serial.println("Unsupported UID length."); pulse(RED_LED, 3); return;
  }
  char hex[21] = {0};
  for (uint8_t i = 0; i < uidLength; ++i) snprintf(hex + i * 2, 3, "%02X", uidBytes[i]);
  String uid(hex);
  if (uid == heldUid) return;
  heldUid = uid;
  if (DISCOVERY_ONLY) Serial.println(String("Card UID: ") + uid);
  else submit(uid);
}
