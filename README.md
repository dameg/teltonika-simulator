# Teltonika GPS Device Simulator

Symulator urządzeń Teltonika GPS. Generuje deterministyczne dane pojazdów,
koduje je jako pakiety Teltonika Codec 8 Extended i wysyła przez TCP do
skonfigurowanego parsera.

Projekt zawiera także dashboard do konfiguracji urządzeń, uruchamiania sesji,
podglądu pozycji na mapie oraz przeglądania zapisanych ramek i telemetrii.

## Możliwości

- symulacja jednego lub wielu niezależnych urządzeń;
- deterministyczna trasa, prędkość i zdarzenia na podstawie seed;
- style jazdy: `eco`, `normal` i `aggressive`;
- komunikacja TCP z handshake IMEI i pakietami Codec 8 Extended;
- lokalny dashboard z historią sesji, tras i ramek;
- gotowe trasy Kraków–Berlin oraz Monachium–Rzym;
- tryb `--dry-run` do generowania pakietów bez połączenia TCP.

## Wymagania

- Node.js 20 lub nowszy;
- npm;
- Docker, jeśli używasz dashboardu z lokalną bazą PostgreSQL.

## Szybki start

Zainstaluj zależności, uruchom bazę, migracje i dashboard:

```bash
npm install
npm run dev:db
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
| `npm run dev:db` | Uruchamia lokalną bazę, migracje i dashboard |
| `npm run build` | Buduje aplikację i CLI |
| `npm run dashboard` | Uruchamia zbudowany dashboard |
| `npm run cli -- --help` | Pokazuje opcje symulatora |
| `npm run typecheck` | Sprawdza typy TypeScript |
| `npm test` | Uruchamia testy |
| `npm run db:down` | Zatrzymuje lokalną bazę danych |

## Uruchomienie symulatora z CLI

Najpierw zbuduj projekt:

```bash
npm run build
```

Następnie uruchom urządzenie i wyślij dane do parsera:

```bash
npm run cli -- \
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
npm run cli -- \
  --host 127.0.0.1 \
  --port 5027 \
  --imei 356307042441013 \
  --device-profile fmc003 \
  --dry-run \
  --count 3
```

Pełną listę opcji wyświetla polecenie `npm run cli -- --help`.
