# Teltonika GPS Device Simulator

Symulator urządzeń Teltonika GPS. Generuje deterministyczne dane pojazdów,
koduje je jako pakiety Teltonika Codec 8 Extended i wysyła przez TCP do
skonfigurowanego parsera.

Projekt zawiera także dashboard do konfiguracji urządzeń, uruchamiania sesji,
podglądu pozycji na mapie oraz przeglądania zapisanych ramek i telemetrii.
Rdzeń symulatora jest publikowany jako prywatna paczka npm dla projektów
firmowych.

## Możliwości

- symulacja jednego lub wielu niezależnych urządzeń;
- deterministyczna trasa, prędkość i zdarzenia na podstawie seed;
- style jazdy: `eco`, `normal` i `aggressive`;
- komunikacja TCP z handshake IMEI i pakietami Codec 8 Extended;
- lokalny dashboard z historią sesji, tras i ramek;
- gotowe presety tras Rotterdam–Genua, Rotterdam–Warszawa, Gdańsk–Wiedeń,
  Barcelona–Mediolan i Strasburg–Budapeszt;
- tryb `--dry-run` do generowania pakietów bez połączenia TCP.

## Wymagania

- Node.js 20 lub nowszy;
- pnpm 11.0.4;
- Docker, jeśli używasz dashboardu z lokalną bazą PostgreSQL.

## Szybki start

Zainstaluj zależności, uruchom bazę, migracje i dashboard:

```bash
pnpm install
pnpm run dev:db
```

Następnie otwórz [http://localhost:3000](http://localhost:3000).

Dashboard uruchamia również lokalny parser TCP pod adresem
`127.0.0.1:5027`.

## Profile urządzeń

Wybierz profil w dashboardzie lub podaj go przez `--device-profile`.
Wszystkie profile używają protokołu Codec 8 Extended.

| Nazwa profilu | Model | Symulowane dane specyficzne dla modelu |
|---|---|---|
| `default-codec8e` | Domyślny Codec 8 Extended | Podstawowe dane GPS, zapłon, ruch, napięcie i zdarzenia jazdy |
| `fmc003` | Teltonika FMC003 | Paliwo, przebieg, obciążenie silnika, RPM, prędkość i pozycja pedału gazu |
| `fmc150` | Teltonika FMC150 | Dane CAN: prędkość, paliwo, RPM, przebieg, hamulec, sprzęgło, tempomat i PTO |
| `fmc250` | Teltonika FMC250 | Dane CAN jak dla FMC150, w osobnym profilu urządzenia |
| `fmc650-fms` | Teltonika FMC650 FMS/J1939 | Dane FMS/J1939: hamulec, prędkość, paliwo, RPM, osie, PTO i przebiegi |

## Podstawowe komendy

| Komenda | Opis |
|---|---|
| `pnpm run dev:db` | Uruchamia lokalną bazę, migracje i dashboard |
| `pnpm run build` | Buduje aplikację, CLI i paczkę biblioteczną |
| `pnpm run dashboard` | Uruchamia zbudowany dashboard |
| `pnpm run cli -- --help` | Pokazuje opcje symulatora |
| `pnpm run typecheck` | Sprawdza typy TypeScript |
| `pnpm test` | Uruchamia testy |
| `pnpm run verify:package` | Sprawdza ESM, CommonJS i deklaracje typów |
| `pnpm run db:down` | Zatrzymuje lokalną bazę danych |

## Uruchomienie symulatora z CLI

Najpierw zbuduj projekt:

```bash
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

Dodaj kolejne `--imei`, aby uruchomić wiele urządzeń. Użyj
`--driving-style eco`, `normal` lub `aggressive`, aby wybrać styl jazdy.

## Generowanie pakietów bez połączenia TCP

Tryb dry run zapisuje pakiety w standardowym wyjściu i nie otwiera połączenia
sieciowego:

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

Zaawansowane moduły symulacji, tras, profili, Codec 8 Extended i transportu są
dostępne z subpathu `@company/teltonika-simulator/core`. Dashboard, NestJS,
React i PostgreSQL nie są częścią publikowanego artefaktu.
