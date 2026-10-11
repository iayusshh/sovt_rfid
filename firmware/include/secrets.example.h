#pragma once
// Copy to secrets.h. Never commit the completed file or share compiled firmware.
constexpr char WIFI_SSID[] = "";
constexpr char WIFI_PASSWORD[] = "";
constexpr char API_ORIGIN[] = "https://your-attendance-host.example";
constexpr char READER_TOKEN[] = "";
constexpr char SITES_ACCESS_TOKEN[] = ""; // Private Sites service access, if required.
constexpr char ROOT_CA[] = R"PEM(
-----BEGIN CERTIFICATE-----
PASTE_OFFICIAL_ISSUING_ROOT_CA_PEM_HERE
-----END CERTIFICATE-----
)PEM";
constexpr bool DISCOVERY_ONLY = false;
constexpr int PN532_SS = 5;
constexpr int SPI_SCK = 18;
constexpr int SPI_MISO = 19;
constexpr int SPI_MOSI = 23;
constexpr int GREEN_LED = 25; // -1 disables an LED; use external LEDs + resistors.
constexpr int RED_LED = 26;
constexpr bool LED_ACTIVE_HIGH = true;
