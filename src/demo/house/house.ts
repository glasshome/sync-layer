import { WEATHER_FIXTURES } from "../kinds/readings";
import type { DeviceSpec } from "../kinds/types";
import { room, wholeHouse } from "./builders";

export interface HouseRoom {
  id: string;
  name: string;
  floor: string;
  devices: DeviceSpec[];
}

export interface HousePerson {
  id: string;
  name: string;
  template: "commuter" | "home_office" | "student";
}

export interface House {
  version: number;
  floors: { id: string; name: string; level: number }[];
  rooms: HouseRoom[];
  people: HousePerson[];
  whole: DeviceSpec[];
}

const LIVING_LIGHTS = { domain: "light", service: "turn_on", data: { brightness_pct: 20 }, area: "living_room" };
const ALL_LIGHTS_OFF = { domain: "light", service: "turn_off" };
const ALL_LOCKS_LOCKED = { domain: "lock", service: "lock" };

export const HOUSE: House = {
  version: 1,
  floors: [
    { id: "ground", name: "Ground floor", level: 0 },
    { id: "upstairs", name: "Upstairs", level: 1 },
  ],
  rooms: [
    room("living_room", "Living Room", "ground", (b) => [
      b.light("Main", { id: "light.living_room_main", colorTemp: true, watts: 40 }),
      b.light("Studio RGB", { id: "light.studio_rgb", color: true, colorTemp: true }),
      b.light("Floor lamp", { colorTemp: true }),
      b.light("Reading lamp"),
      b.light("Shelf strip", { color: true }),
      b.climate("Thermostat", { id: "climate.living_room_thermostat" }),
      b.climateSensor("Climate", { temperatureId: "sensor.temperature_living", humidityId: "sensor.humidity_living" }),
      b.cover("Blinds", { id: "cover.living_room_blinds", tilt: true, manufacturer: "Somfy", model: "Roller Shade" }),
      b.cover("Shutters", {
        id: "cover.living_room_shutters",
        tilt: true,
        deviceClass: "shutter",
        manufacturer: "Somfy",
        model: "Venetian Shutter",
      }),
      b.switchDevice("Fan", { id: "switch.fan_living_room", watts: 45 }),
      b.mediaPlayer("Speaker", { id: "media_player.living_room_speaker", sources: ["Spotify", "AirPlay", "TV"] }),
      b.plug("TV", 120),
      b.fan("Air purifier", {
        id: "fan.air_purifier",
        presets: ["auto", "sleep", "turbo"],
        oscillate: true,
        manufacturer: "Xiaomi",
        model: "Air Purifier 4",
      }),
      b.motion(),
      b.contact("window", "Left window"),
      b.contact("window", "Right window"),
    ]),
    room("kitchen", "Kitchen", "ground", (b) => [
      b.light("Counter", { id: "light.kitchen_counter" }),
      b.light("Pendant"),
      b.light("Spots"),
      b.cover("Blinds", { id: "cover.kitchen_blinds", deviceClass: "blind", model: "Praktlysing" }),
      b.switchDevice("Coffee machine", { id: "switch.coffee_machine", watts: 1200 }),
      b.appliance("Dishwasher", 1800, { legacyPowerId: "sensor.dishwasher_power" }),
      b.appliance("Oven", 2200, { legacyPowerId: "sensor.oven_power" }),
      b.appliance("Fridge", 150, { legacyPowerId: "sensor.fridge_power" }),
      b.plug("Kettle", 2000),
      b.climateSensor("Climate"),
      b.motion(),
      b.smoke(),
      b.leak(),
    ]),
    room("dining", "Dining Room", "ground", (b) => [
      b.light("Table"),
      b.light("Sideboard", { dimmable: false }),
      b.contact("window"),
      b.climateSensor("Climate"),
    ]),
    room("entry", "Entry", "ground", (b) => [
      b.light("Hallway", { id: "light.hallway" }),
      b.lock("Front door lock", { id: "lock.front_door_lock", batteryId: "sensor.door_lock_battery" }),
      b.contact("door", "Front door", { id: "binary_sensor.front_door", batteryId: "sensor.battery_door_sensor" }),
      b.motion("Hallway motion", { id: "binary_sensor.motion_hallway", batteryId: "sensor.motion_sensor_battery" }),
      b.camera("Front door camera", { id: "camera.front_door_camera" }),
    ]),
    room("utility", "Utility", "ground", (b) => [
      b.appliance("Washing machine", 2000, { legacyPowerId: "sensor.washing_machine_power" }),
      b.appliance("Dryer", 2500),
      b.waterHeater("Boiler", { id: "water_heater.boiler", modes: ["off", "eco", "performance"], min: 43, max: 60 }),
      b.waterHeater("Heat pump tank", {
        id: "water_heater.heat_pump_tank",
        modes: ["off", "eco", "heat_pump", "high_demand"],
        min: 43,
        max: 60,
      }),
      b.leak(),
      b.light("Ceiling", { dimmable: false }),
    ]),
    room("garage", "Garage", "ground", (b) => [
      b.cover("Garage door", {
        id: "cover.garage_door",
        position: false,
        deviceClass: "garage",
        manufacturer: "Chamberlain",
        model: "MyQ",
      }),
      b.cover("Driveway gate", {
        id: "cover.driveway_gate",
        position: false,
        deviceClass: "gate",
        manufacturer: "Nice",
        model: "Robus",
      }),
      b.lock("Back door", { id: "lock.back_door_lock", manufacturer: "August", model: "Smart Lock Pro" }),
      b.plug("EV charger", 7200, {
        legacyPowerId: "sensor.ev_charger_power",
        manufacturer: "Wallbox",
        model: "Pulsar Plus",
      }),
      b.light("Ceiling", { dimmable: false }),
      b.motion(),
    ]),
    room("office", "Office", "ground", (b) => [
      b.light("Ceiling"),
      b.light("Desk lamp", { colorTemp: true }),
      b.plug("Monitor", 35),
      b.plug("Printer", 15),
      b.climateSensor("Climate"),
      b.contact("window"),
      b.cover("Blinds"),
    ]),
    room("bedroom", "Bedroom", "upstairs", (b) => [
      b.light("Ceiling", { id: "light.bedroom_ceiling", colorTemp: true }),
      b.light("Desk RGB", { id: "light.desk_rgb", color: true, colorTemp: true }),
      b.light("Bedside left"),
      b.light("Bedside right"),
      b.climate("AC", {
        id: "climate.bedroom_ac",
        modes: ["off", "cool", "heat", "dry", "fan_only"],
        manufacturer: "Daikin",
        model: "Split AC",
      }),
      b.fan("Ceiling fan", { id: "fan.bedroom_ceiling", direction: true }),
      b.cover("Curtains", { id: "cover.bedroom_curtains", deviceClass: "curtain" }),
      b.contact("window", "Window", { id: "binary_sensor.window_bedroom" }),
      b.climateSensor("Climate"),
      b.motion(),
    ]),
    room("bathroom", "Bathroom", "upstairs", (b) => [
      b.light("Ceiling", { id: "light.bathroom" }),
      b.light("Mirror"),
      b.fan("Extractor", { watts: 20 }),
      b.climateSensor("Climate"),
      b.leak(),
      b.contact("window"),
    ]),
    room("kids_room", "Kids Room", "upstairs", (b) => [
      b.light("Ceiling"),
      b.light("Night light", { color: true }),
      b.cover("Blinds"),
      b.climateSensor("Climate"),
      b.contact("window"),
      b.motion(),
    ]),
    room("guest_room", "Guest Room", "upstairs", (b) => [
      b.light("Ceiling"),
      b.light("Bedside"),
      b.climateSensor("Climate"),
      b.contact("window"),
    ]),
    room("landing", "Landing", "upstairs", (b) => [b.light("Ceiling"), b.motion(), b.smoke()]),
    room("garden", "Garden", "ground", (b) => [
      b.light("Path lights", { dimmable: false }),
      b.light("Terrace"),
      b.switchDevice("Irrigation", { watts: 10 }),
      b.plug("Pond pump", 60),
      b.climateSensor("Weather station", { temperatureId: "sensor.temperature_outdoor" }),
      b.motion(),
      b.contact("door", "Gate"),
    ]),
  ],
  people: [
    { id: "alex", name: "Alex", template: "commuter" },
    { id: "sam", name: "Sam", template: "home_office" },
    { id: "robin", name: "Robin", template: "student" },
  ],
  whole: wholeHouse((b) => [
    b.sun(),
    b.weather("Home"),
    b.energyMeter("Energy meter", { entityName: "Home consumption" }),
    b.fixedSensor("Power consumption", { value: 1.2, unit: "kW", deviceClass: "power" }),
    b.fixedSensor("Electricity Maps", {
      id: "sensor.electricity_maps_co2_intensity",
      entityName: "CO2 intensity",
      value: 214,
      unit: "gCO2eq/kWh",
    }),
    b.fixedSensor("Electricity Maps", {
      key: "electricity_maps_fossil_fuel_percentage",
      deviceId: "electricity_maps",
      entityName: "Fossil fuel percentage",
      value: 31,
      unit: "%",
    }),
    b.fixedSensor("Nordpool", {
      id: "sensor.nordpool_current_price",
      entityName: "Current price",
      value: 0.18,
      unit: "EUR/kWh",
    }),
    b.button("Restart Home Assistant"),
    b.button("Update firmware"),
    b.scene("Movie night", [
      LIVING_LIGHTS,
      { domain: "cover", service: "close_cover", entityIds: ["cover.living_room_blinds"] },
      { domain: "media_player", service: "media_play_pause", entityIds: ["media_player.living_room_speaker"] },
    ]),
    b.scene("Good morning", [
      { domain: "cover", service: "open_cover", entityIds: ["cover.bedroom_curtains"] },
      { domain: "light", service: "turn_on", entityIds: ["light.kitchen_counter"] },
      { domain: "switch", service: "turn_on", entityIds: ["switch.coffee_machine"] },
    ]),
    b.scene("Good night", [ALL_LIGHTS_OFF, ALL_LOCKS_LOCKED, { domain: "cover", service: "close_cover" }]),
    b.scene("Dinner", [
      { domain: "light", service: "turn_on", data: { brightness_pct: 60 }, entityIds: ["light.dining_table"] },
      { domain: "light", service: "turn_on", data: { brightness_pct: 40 }, entityIds: ["light.kitchen_pendant"] },
    ]),
    b.scene("Away", [ALL_LIGHTS_OFF, ALL_LOCKS_LOCKED]),
    ...WEATHER_FIXTURES.map((w) => b.weatherShowcase(w)),
  ]),
};
