# Changelog

## [0.11.6](https://github.com/glasshome/sync-layer/compare/v0.11.5...v0.11.6) (2026-10-04)


### Bug Fixes

* **worker:** refuse target keys the check does not expand and forward the checked call ([#19](https://github.com/glasshome/sync-layer/issues/19)) ([f18263a](https://github.com/glasshome/sync-layer/commit/f18263a18e4a5fb1d6a3b90b80ce543d089ba30c))

## [0.11.5](https://github.com/glasshome/sync-layer/compare/v0.11.4...v0.11.5) (2026-10-04)


### Bug Fixes

* **enforcement:** refuse network schemes only, so provider ids like library:// pass ([#17](https://github.com/glasshome/sync-layer/issues/17)) ([38ef102](https://github.com/glasshome/sync-layer/commit/38ef102df9dd3bc4d25ec5143c5301fbe502c173))

## [0.11.4](https://github.com/glasshome/sync-layer/compare/v0.11.3...v0.11.4) (2026-10-02)


### Bug Fixes

* **demo:** schedule tests advance hours in minute steps ([4746b9b](https://github.com/glasshome/sync-layer/commit/4746b9be9eb073ad2c5930d3a32532a7c2ec97bf))

## [0.11.3](https://github.com/glasshome/sync-layer/compare/v0.11.2...v0.11.3) (2026-10-02)


### Bug Fixes

* **demo:** replay budget test bounds a blowup instead of racing a loaded runner ([1dce484](https://github.com/glasshome/sync-layer/commit/1dce484c85f8009414ba99d78a5082a0b7babc39))

## [0.11.2](https://github.com/glasshome/sync-layer/compare/v0.11.1...v0.11.2) (2026-10-02)


### Bug Fixes

* **worker:** refuse widget service calls that name a network URL ([f712303](https://github.com/glasshome/sync-layer/commit/f7123032292825dc45c6b8660da23090b0ea819c))

## [0.11.1](https://github.com/glasshome/sync-layer/compare/v0.11.0...v0.11.1) (2026-10-02)


### Bug Fixes

* serve HA's local copy of remotely accessible media art ([b27b001](https://github.com/glasshome/sync-layer/commit/b27b0015ef862e7182b794ca3516c78ea3172594))

## [0.11.0](https://github.com/glasshome/sync-layer/compare/v0.10.2...v0.11.0) (2026-09-28)


### Features

* **worker:** carry the socket close code and reason on a disconnect ([0d4ec83](https://github.com/glasshome/sync-layer/commit/0d4ec837f5db796d863c04113eebcf695ac2eeda))

## [0.10.2](https://github.com/glasshome/sync-layer/compare/v0.10.1...v0.10.2) (2026-09-28)


### Performance Improvements

* **demo:** a projection formats each instant once, not once per entity ([00e553b](https://github.com/glasshome/sync-layer/commit/00e553bd939d4aaf93719b51a595a9856136d09c))

## [0.10.1](https://github.com/glasshome/sync-layer/compare/v0.10.0...v0.10.1) (2026-09-27)


### Bug Fixes

* **demo:** service-call fields are read only when they are strings, and the demo passes dash's lint ([a847df0](https://github.com/glasshome/sync-layer/commit/a847df052ca745519befc09e20c4230c451b054c))

## [0.10.0](https://github.com/glasshome/sync-layer/compare/v0.9.1...v0.10.0) (2026-09-27)


### Features

* **demo:** a simulated demo house replaces the static fixtures ([21f5542](https://github.com/glasshome/sync-layer/commit/21f55422a74afafd4c25b8d79130f00954221c9d))

## [0.9.1](https://github.com/glasshome/sync-layer/compare/v0.9.0...v0.9.1) (2026-09-27)


### Bug Fixes

* **deps:** ha-types 0.2.0 ([9e49de5](https://github.com/glasshome/sync-layer/commit/9e49de50a33a1fab230fc4cc5d4b8274a0773674))
* handle the promises the connection and camera code left floating ([00d67bf](https://github.com/glasshome/sync-layer/commit/00d67bf800ec15f34db8b7c03b74876eb0f64635))
* log WebRTC unsubscribe failures, deprecate ConnectionOptions, drop initConnection from docs and errors ([0907ee7](https://github.com/glasshome/sync-layer/commit/0907ee7489dc837c41e77d2e7abe3efce9fd10e2))

## [0.9.0](https://github.com/glasshome/sync-layer/compare/v0.8.2...v0.9.0) (2026-09-27)


### Features

* **demo:** numeric sensors serve a day of history, a gentle curve ending at the current reading ([130637a](https://github.com/glasshome/sync-layer/commit/130637a256aca406f51d3dcd23a79c6a40e9601d))
* **demo:** numeric sensors serve hour and day statistics from their demo curve ([a44c041](https://github.com/glasshome/sync-layer/commit/a44c04185ad235e03f81f401bd5c8efe210fc4a9))
* **demo:** the demo speaker carries an album cover and skips tracks ([afaadb3](https://github.com/glasshome/sync-layer/commit/afaadb348ace5f57907e7ae4eb3b2c41db3d44de))
* **demo:** the demo sun reports whether it is rising and eases through twilight ([49fc1e3](https://github.com/glasshome/sync-layer/commit/49fc1e3ad3d6340ac30ded25419d38f559ae9d03))
* **weather:** forecasts stay live while a widget reads them ([39961bd](https://github.com/glasshome/sync-layer/commit/39961bdd5ebeb5384635bf122d09be33acea0408))


### Bug Fixes

* **demo:** the demo camera streams and shows its still from the dashboard's own origin ([79ca47b](https://github.com/glasshome/sync-layer/commit/79ca47bb202980a0b1081c1cbaf01a6f9e6731fd))
* **deps:** widget-contract 0.3.0 ([0a19261](https://github.com/glasshome/sync-layer/commit/0a19261b9c111dfcb20b3a3a18ffb10e65e27cde))

## [0.8.2](https://github.com/glasshome/sync-layer/compare/v0.8.1...v0.8.2) (2026-09-21)


### Bug Fixes

* **worker:** the host hears a ping timeout and a connecting state ([#2](https://github.com/glasshome/sync-layer/issues/2)) ([93e0064](https://github.com/glasshome/sync-layer/commit/93e0064d1a06c380cbe3dc60610c2a56143c25ef))

## [0.8.1](https://github.com/glasshome/sync-layer/compare/v0.8.0...v0.8.1) (2026-09-03)


### Bug Fixes

* **deps:** widget-contract 0.2.1 ([67edf21](https://github.com/glasshome/sync-layer/commit/67edf217af55298ba16723d4aaa228647e87fa6e))
