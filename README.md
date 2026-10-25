# Teltonika GPS Device Simulator

Symulator urządzeń Teltonika GPS. Generuje deterministyczny ruch pojazdu,
koduje go jako pakiety Teltonika Codec 8 Extended i wysyła przez TCP do
skonfigurowanego parsera.

Rdzeń symulatora jest też publikowany jako prywatna paczka npm dla testów
integracyjnych.

## Możliwości

- symulacja jednego lub wielu niezależnych urządzeń;
- deterministyczna trasa, prędkość i zdarzenia na podstawie seed;
- style jazdy: `eco`, `normal` i `aggressive`;
- profile urządzeń Codec 8 Extended;
- komunikacja TCP z handshake IMEI i pakietami Codec 8 Extended;
- gotowe trasy Rotterdam–Genua, Rotterdam–Warszawa, Gdańsk–Wiedeń,
  Barcelona–Mediolan i Strasburg–Budapeszt;
- kontener testowy, w którym każde IMEI jest osobną instancją pojazdu;
- tryb `--dry-run` do generowania pakietów bez połączenia TCP.

## Wymagania

- Node.js 20 lub nowszy;
- pnpm 11.0.4;
- Docker, jeśli uruchamiasz symulator w kontenerze.

## Profile urządzeń

Profil opisuje model urządzenia i mapowanie stanu pojazdu na elementy IO
Codec 8 Extended. Wbudowane profile są w `src/device-profile.ts`. Wybierz
profil flagą `--device-profile` albo zmienną `TELTONIKA_DEVICE_PROFILE`.

| Nazwa profilu | Model | Symulowane dane specyficzne dla modelu |
|---|---|---|
| `default-codec8e` | Domyślny Codec 8 Extended | Podstawowe dane GPS, zapłon, ruch, napięcie i zdarzenia jazdy |
| `fmc003` | Teltonika FMC003 | Paliwo, przebieg, obciążenie silnika, RPM, prędkość i pozycja pedału gazu |
| `fmc150` | Teltonika FMC150 | Dane CAN: prędkość, paliwo, RPM, przebieg, hamulec, sprzęgło, tempomat i PTO |
| `fmc250` | Teltonika FMC250 | Dane CAN jak dla FMC150, w osobnym profilu urządzenia |
| `fmc650-fms` | Teltonika FMC650 FMS/J1939 | Dane FMS/J1939: hamulec, prędkość, paliwo, RPM, osie, PTO i przebiegi |

Nowy profil dodajesz w `src/device-profile.ts`: obiekt zgodny z `DeviceProfile`,
rejestracja w `deviceProfiles` i nazwa przekazana do `validateDeviceProfile`.
Potem przebuduj aplikację albo paczkę. Styl jazdy (`eco`, `normal`,
`aggressive`) jest osobnym profilem w `src/driving-style.ts` i wybiera się go
przez `--driving-style`.

## Podstawowe komendy

| Komenda | Opis |
|---|---|
| `pnpm run build` | Buduje CLI i paczkę biblioteczną |
| `pnpm run cli -- --help` | Pokazuje opcje symulatora |
| `pnpm run typecheck` | Sprawdza typy TypeScript |
| `pnpm test` | Uruchamia testy |
| `pnpm run verify:package` | Sprawdza ESM, CommonJS i deklaracje typów |

## Uruchomienie symulatora z CLI

Najpierw zbuduj projekt:

```bash
pnpm install
pnpm run build
```

Następnie uruchom urządzenie i wyślij dane do parsera:

```bash
pnpm run cli -- \
  --host 127.0.0.1 \
  --port 5027 \
  --imei 356307042441013 \
  --route-file routes/rotterdam-genoa.route.json \
  --device-profile fmc650-fms
```

Dodaj kolejne `--imei`, aby uruchomić kolejne instancje. Każde IMEI ma własną
sesję TCP i własny przebieg trasy. Użyj `--driving-style eco`, `normal` lub
`aggressive`, aby wybrać styl jazdy.

Jeden proces CLI używa jednego profilu, jednej trasy i jednego stylu jazdy
dla wszystkich IMEI. Inny profil uruchom w osobnym procesie albo w osobnym
kontenerze.

## Kontener testowy

Obraz Dockera uruchamia to samo CLI. Skopiuj przykładowe środowisko, wskaż
parser i listę IMEI, a potem zbuduj kontener:

```bash
cp .env.example .env
docker compose up --build
```

`TELTONIKA_IMEIS` może zawierać kilka numerów rozdzielonych przecinkami.
Kontener wystartuje wtedy jedną instancję pojazdu na każde IMEI. Zatrzymanie:

```bash
docker compose down
```

Drugi profil w tym samym Compose to druga usługa z tym samym obrazem i innymi
`TELTONIKA_IMEIS` oraz `TELTONIKA_DEVICE_PROFILE`.

Pojedynczy przebieg bez zostawiania kontenera w tle:

```bash
docker compose run --rm --no-deps simulator \
  node dist/src/cli.js \
  --host 127.0.0.1 \
  --port 5027 \
  --imei 356307042441013 \
  --device-profile fmc003 \
  --dry-run \
  --count 3
```

`docker compose run` i tak wymaga ustawionych `TELTONIKA_HOST` i
`TELTONIKA_IMEIS`, bo Compose podstawia je przed startem. W trybie `--dry-run`
połączenie TCP nie jest otwierane.

## Generowanie pakietów bez połączenia TCP

```bash
pnpm run cli -- \
  --host 127.0.0.1 \
  --port 5027 \
  --imei 356307042441013 \
  --device-profile fmc003 \
  --dry-run \
  --count 3
```

Pełną listę opcji wyświetla polecenie `pnpm run cli -- --help`.

## Użycie jako paczka

Paczka jest przeznaczona dla projektów Node.js i jest publikowana w prywatnym
GitHub Packages pod scope'em firmowej organizacji. W projekcie konsumenta
skonfiguruj registry:

```ini
@company:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
```

Następnie zainstaluj wersję paczki:

```bash
pnpm add @company/teltonika-simulator
```

Token powinien być dostarczony przez środowisko lokalne albo CI i nie może być
zapisany w repozytorium.

Podstawowy interfejs tworzy jedno urządzenie i wysyła dane po TCP:

```ts
import { Device, presets } from "@company/teltonika-simulator";

const device = new Device({
  imei: "356307042441013",
  host: "127.0.0.1",
  port: 5027,
  route: presets.routes.rotterdamWarsaw,
  drivingStyle: presets.drivingStyles.normal,
  deviceProfile: presets.deviceProfiles.fmc650Fms,
});

device.on("recordAccepted", ({ record }) => {
  console.log(record.timestampMs, record.gps.latitude, record.gps.longitude);
});

await device.start();
device.update({ drivingStyle: "aggressive", intervalMs: 500 });
await device.stop();
```

`start()` kończy się po zaakceptowaniu IMEI. `device.done` zwraca wynik całej
sesji, a `getSnapshot()` i `resumeFrom` umożliwiają wznowienie trasy.
Kolejną instancję tworzysz następnym `new Device(...)`.

Zaawansowane moduły symulacji, tras, profili, Codec 8 Extended i transportu są
dostępne z subpathu `@company/teltonika-simulator/core`.
