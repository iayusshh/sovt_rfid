# Portable attendance reader

## Research before implementation (11 October 2026)

The reader is an ESP32 DevKit using a PN532 in SPI mode. Adafruit's current PN532 library is 1.3.4, supports a hardware SPI constructor and bounded `readPassiveTargetID` calls for ISO14443 Type A UIDs. The firmware uses those documented APIs, not card memory access. ESP32 HTTPS requires a trusted CA certificate and a valid clock; the code calls `setCACert` and synchronizes NTP before any authenticated request. It never disables certificate verification.

Sources: [Adafruit PN532 source/library](https://github.com/adafruit/Adafruit-PN532), [UID example](https://github.com/adafruit/Adafruit-PN532/blob/master/examples/iso14443a_uid/iso14443a_uid.ino), [Adafruit wiring and interface guide](https://learn.adafruit.com/adafruit-pn532-rfid-nfc), [Espressif secure client](https://github.com/espressif/arduino-esp32/tree/master/libraries/NetworkClientSecure).

An iPhone is the faculty web dashboard; it is not the reader. College-card compatibility remains unknown. Use compatible 13.56 MHz Type A demo cards if needed. This implementation does not read 125 kHz cards, UHF cards, or every card supported by the PN532. A UID can be cloned and some cards randomize it: this is demonstration identity mapping, not cryptographic student authentication.

## Parts and wiring

Use an ESP32-WROOM-32 DevKit (PlatformIO board `esp32dev`), PN532 breakout with SPI support and 3.3 V logic, USB cable/power bank, jumpers, and compatible cards. Optional separate green/red LEDs each need a 220–330 Ω series resistor. Check your exact breakout's power specification; the mapping below assumes a module that accepts 3.3 V supply. ESP32 GPIOs must never receive 5 V.

| PN532 | ESP32 |
|---|---|
| VCC (3.3 V compatible module) | 3V3 |
| GND | GND |
| SCK | GPIO18 |
| MISO | GPIO19 |
| MOSI | GPIO23 |
| SS / SSEL / CS | GPIO5 |

Set the PN532's switches/jumpers to **SPI according to its own board instructions**, then power-cycle it. No IRQ/reset wiring is used by this hardware SPI constructor. Green LED anode via resistor to GPIO25; red LED anode via resistor to GPIO26; both cathodes to ground. Pins and polarity can be changed in configuration. There is no assumed onboard LED or buzzer.

## Configure and flash

1. Install [PlatformIO](https://docs.platformio.org/en/latest/core/installation/index.html) (or its VS Code extension). From `firmware`, copy `include/secrets.example.h` to `include/secrets.h`. That local file and build output are ignored.
2. Fill the 2.4 GHz Wi-Fi credentials, **HTTPS origin with no trailing slash**, and the reader credential created in the admin Readers page. Use a dedicated reader credential; rotate it if shared accidentally.
3. Paste the deployed hostname's trusted **root CA PEM** into `ROOT_CA`. Obtain it from the issuing CA's official certificate repository after inspecting the site's chain in your browser. Do not paste only the leaf certificate, disable verification, or trust a certificate retrieved over an unverified connection. Chains can change, so refresh this configuration when a valid hostname/clock starts failing TLS.
4. For the Vercel deployment, leave `SITES_ACCESS_TOKEN` empty. The app reader credential is sufficient; Vercel deployment protection must allow machine requests to the production hostname. The optional Sites header remains in firmware only for older hosting.
5. Run `pio run`, connect USB, then `pio run --target upload`. Read `pio device monitor` at 115200 baud. The checked-in example compiles but refuses network operation until real configuration and CA trust are supplied. Do not publish your flashed binary: it contains credentials.

## Enroll arbitrary compatible cards

Set `DISCOVERY_ONLY = true`, flash, and open the serial monitor. Tap one card at a time; the monitor prints its uppercase hexadecimal UID. It prints no tokens/passwords. Record that UID against the correct student in the admin student form; each card maps to one student. Discovery makes no server submissions and works without Wi-Fi. Return `DISCOVERY_ONLY` to false and flash again for attendance. Use only cards whose stable UID was confirmed repeatedly; no per-card iPhone automation is needed.

## Class demonstration

Admin enrolls students in the course and creates a reader. Faculty signs in on the iPhone, selects the assigned course and that reader, and opens a session. The device heartbeats every 20 seconds; it scans attendance cards only after a successful heartbeat reports an active session. Tap and **remove** each card before the next tap. First valid scans are present, or late after 10 minutes using server time. Duplicate scans preserve the first mark. Closing the session records absent students from its roster. Faculty corrections require an audit reason.

Green one pulse means server-confirmed present/late; green two pulses means server-confirmed duplicate. Red three pulses means failure or rejected card. Serial messages distinguish unknown card, wrong enrollment, closed session, authentication failure and network error. Heartbeat messages show active/idle state. A radio tap alone never lights green. No offline queue exists: if a request fails, remove the card and retap after connectivity recovers. One immediate retry reuses the same event ID only for a transport error while still online. A response lost after server commit is ambiguous; a subsequent retap safely receives duplicate if already recorded. Faculty can inspect the roster before correcting.

## Troubleshooting and FAQ

**No PN532 detected?** Check 3.3 V supply, common ground, SPI switch setting, exact pin labels and power-cycle. A detected PN532 does not prove card compatibility.

**No card UID?** Check 13.56 MHz Type A compatibility; try a known NTAG/MIFARE demo card. A printed college-card number is not necessarily its chip UID.

**No active session?** Check that faculty selected this reader and opened a session. Heartbeat caches session state for at most 20 seconds; the server remains authoritative if the session closes between heartbeat and tap.

**Wi-Fi connects but requests fail?** Confirm time sync (NTP must be reachable), hostname/root CA, reader enabled/token, HTTPS origin and deployment access. 401/403 is a credential/access failure, not attendance success. Captive portals and enterprise campus Wi-Fi may need a different network; this firmware uses personal WPA Wi-Fi, such as a hotspot.

**Can someone copy a card?** UID cloning is possible. A supervised assignment demonstration is appropriate; production identity assurance needs a stronger card protocol and threat model.

## Physical acceptance checklist

Compilation is not RF/device validation. Before calling this hardware working, verify on the actual board: PN532 boot detection; repeated stable UID reads; TLS using the real deployed hostname and CA; successful heartbeat and idle/active transitions; green only after real server attendance; unknown/un-enrolled card rejection; duplicate tap preservation; close-session rejection; Wi-Fi loss with red/no false success; recovery and retap; reader disable/token rotation; card removal debounce; 10-minute late boundary; power-bank operation. Compare the physical taps with dashboard/CSV records. No physical board, cards or LEDs were available during implementation.

## Build verification

On 11 October 2026, `pio run` succeeded for `esp32dev` with Espressif32 6.12.0 / Arduino ESP32 2.0.17, Adafruit PN532 1.3.4 and ArduinoJson 7.4.2. The unconfigured example build used 39,672 bytes RAM (12.1%) and 685,497 bytes flash (52.3%). The local secret header remains absent, so this proves compilation of the safe example configuration; it does not prove network access, credentials, RF reads or a physical device flash. Build output is intentionally ignored.
