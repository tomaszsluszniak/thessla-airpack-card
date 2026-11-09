# Changelog

Wszystkie istotne zmiany w karcie. Format: [Keep a Changelog](https://keepachangelog.com/pl/1.1.0/),
wersje: [Semantic Versioning](https://semver.org/lang/pl/). Opis wydania na GitHubie powstaje z sekcji
danej wersji, więc każde wydanie musi mieć tu swój wpis.

## [Unreleased]

## [2.4.1] - 2026-11-09

### Poprawione

- Harmonogram: nie dało się przejść z jednego dnia na inny (zaznaczonego dnia nie można było odznaczyć).
  Rząd dni wybiera teraz jeden dzień do podglądu i edycji, a kopiowanie planu na inne dni ma osobny rząd
  „Zapisz także na:” – działa też bez zmian w planie.
- Zmiana dnia lub sezonu przy niezapisanych zmianach wymaga drugiego dotknięcia, zamiast po cichu je porzucać.

## [2.4.0] - 2026-11-09

### Dodane

- Edycja harmonogramu trybu AUTO jak w panelu Air++ (odczyty → „Harmonogram trybu AUTO”): sezon Lato/Zima,
  wybór dni (kilka naraz zapisuje ten sam plan), do 4 odcinków z godziną i intensywnością, godzina wietrzenia.
  Wymaga esphome-thessla-airpack 1.2.0.
- Opcja `schedule_temperature` – temperatura nawiewu w odcinkach (dla instalacji z nagrzewnicą lub
  chłodnicą kanałową).

## [2.3.0] - 2026-11-09

### Dodane

- Napięcia sterujące wentylatorów nawiewu i wywiewu w odczytach (klucze `supply_voltage`, `extract_voltage`).

## [2.2.1] - 2026-11-09

### Zmienione

- Temperaturę nawiewu można regulować tylko w trybie KOMFORT; w EKO karta pokazuje odczyt TN1.

## [2.2.0] - 2026-10-30

### Dodane

- Pierwsze publiczne wydanie w HACS.

[Unreleased]: https://github.com/tomaszsluszniak/thessla-airpack-card/compare/v2.4.1...HEAD
[2.4.1]: https://github.com/tomaszsluszniak/thessla-airpack-card/compare/v2.4.0...v2.4.1
[2.4.0]: https://github.com/tomaszsluszniak/thessla-airpack-card/compare/v2.3.0...v2.4.0
[2.3.0]: https://github.com/tomaszsluszniak/thessla-airpack-card/compare/v2.2.1...v2.3.0
[2.2.1]: https://github.com/tomaszsluszniak/thessla-airpack-card/compare/v2.2.0...v2.2.1
[2.2.0]: https://github.com/tomaszsluszniak/thessla-airpack-card/releases/tag/v2.2.0
