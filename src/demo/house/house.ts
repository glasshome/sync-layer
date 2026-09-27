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
      b.light("Living Room Main", { id: "light.living_room_main", colorTemp: true, watts: 40 }),
      b.light("Studio RGB", { id: "light.studio_rgb", color: true, colorTemp: true }),
      b.light("Floor Lamp", { colorTemp: true }),
      b.light("Reading Lamp"),
      b.light("Shelf Strip", { color: true }),
      b.climate("Living Room Thermostat", { id: "climate.living_room_thermostat", supportedFeatures: 385 }),
      b.climateSensor("Living Room Climate", {
        temperatureId: "sensor.temperature_living",
        humidityId: "sensor.humidity_living",
      }),
      b.cover("Living Room Blinds", { id: "cover.living_room_blinds", manufacturer: "Somfy", model: "Roller Shade" }),
      b.cover("Living Room Shutters", {
        id: "cover.living_room_shutters",
        tilt: true,
        deviceClass: "shutter",
        manufacturer: "Somfy",
        model: "Venetian Shutter",
      }),
      b.switchDevice("Living Room Fan", { id: "switch.fan_living_room", watts: 45, deviceClass: "switch" }),
      b.mediaPlayer("Living Room Speaker", {
        id: "media_player.living_room_speaker",
        sources: ["Spotify", "AirPlay", "TV"],
      }),
      b.plug("TV", 120),
      b.fan("Air Purifier", {
        id: "fan.air_purifier",
        presets: ["auto", "sleep", "turbo"],
        oscillate: true,
        manufacturer: "Xiaomi",
        model: "Air Purifier 4",
      }),
      b.motion("Living Room Motion"),
      b.contact("window", "Living Room Left Window"),
      b.contact("window", "Living Room Right Window"),
      b.scene(
        "Movie Night",
        [
          LIVING_LIGHTS,
          { domain: "cover", service: "close_cover", entityIds: ["cover.living_room_blinds"] },
          { domain: "media_player", service: "media_play", entityIds: ["media_player.living_room_speaker"] },
        ],
        { key: "movie_night" },
      ),
    ]),
    room("kitchen", "Kitchen", "ground", (b) => [
      b.light("Kitchen Counter", { id: "light.kitchen_counter" }),
      b.light("Kitchen Pendant"),
      b.light("Kitchen Spots"),
      b.cover("Kitchen Blinds", {
        id: "cover.kitchen_blinds",
        deviceClass: "blind",
        model: "Praktlysing",
        supportedFeatures: 127,
      }),
      b.switchDevice("Coffee Machine", { id: "switch.coffee_machine", watts: 1200, deviceClass: "outlet" }),
      b.appliance("Dishwasher", 1800, { legacyPowerId: "sensor.dishwasher_power" }),
      b.appliance("Oven", 2200, { legacyPowerId: "sensor.oven_power" }),
      b.appliance("Fridge", 150, { legacyPowerId: "sensor.fridge_power" }),
      b.plug("Kettle", 2000),
      b.climateSensor("Kitchen Climate"),
      b.motion("Kitchen Motion"),
      b.smoke("Kitchen Smoke"),
      b.leak("Kitchen Leak"),
    ]),
    room("dining", "Dining Room", "ground", (b) => [
      b.light("Dining Table"),
      b.light("Sideboard", { dimmable: false }),
      b.contact("window", "Dining Room Window"),
      b.climateSensor("Dining Room Climate"),
      b.scene(
        "Dinner",
        [
          { domain: "light", service: "turn_on", data: { brightness_pct: 60 }, entityIds: ["light.dining_table"] },
          { domain: "light", service: "turn_on", data: { brightness_pct: 40 }, entityIds: ["light.kitchen_pendant"] },
        ],
        { key: "dinner" },
      ),
    ]),
    room("entry", "Entry", "ground", (b) => [
      b.light("Hallway", { id: "light.hallway" }),
      b.lock("Front Door Lock", {
        id: "lock.front_door_lock",
        batteryId: "sensor.door_lock_battery",
        supportedFeatures: 1,
      }),
      b.contact("door", "Front Door", { id: "binary_sensor.front_door", batteryId: "sensor.battery_door_sensor" }),
      b.motion("Hallway Motion", { id: "binary_sensor.motion_hallway", batteryId: "sensor.motion_sensor_battery" }),
      b.camera("Front Door Camera", { id: "camera.front_door_camera" }),
    ]),
    room("utility", "Utility", "ground", (b) => [
      b.appliance("Washing Machine", 2000, { legacyPowerId: "sensor.washing_machine_power" }),
      b.appliance("Dryer", 2500),
      b.waterHeater("Boiler", {
        id: "water_heater.boiler",
        modes: ["off", "eco", "performance"],
        min: 43,
        max: 60,
        supportedFeatures: 7,
      }),
      b.waterHeater("Heat Pump Tank", {
        id: "water_heater.heat_pump_tank",
        modes: ["off", "eco", "heat_pump", "high_demand"],
        min: 43,
        max: 60,
        supportedFeatures: 3,
      }),
      b.leak("Utility Leak"),
      b.light("Utility Ceiling", { dimmable: false }),
    ]),
    room("garage", "Garage", "ground", (b) => [
      b.cover("Garage Door", {
        id: "cover.garage_door",
        position: false,
        deviceClass: "garage",
        manufacturer: "Chamberlain",
        model: "MyQ",
      }),
      b.cover("Driveway Gate", {
        id: "cover.driveway_gate",
        position: false,
        deviceClass: "gate",
        manufacturer: "Nice",
        model: "Robus",
        supportedFeatures: 3,
      }),
      b.lock("Back Door Lock", {
        id: "lock.back_door_lock",
        manufacturer: "August",
        model: "Smart Lock Pro",
        supportedFeatures: 1,
      }),
      b.plug("EV Charger", 7200, {
        legacyPowerId: "sensor.ev_charger_power",
        manufacturer: "Wallbox",
        model: "Pulsar Plus",
      }),
      b.light("Garage Ceiling", { dimmable: false }),
      b.motion("Garage Motion"),
    ]),
    room("office", "Office", "ground", (b) => [
      b.light("Office Ceiling"),
      b.light("Desk Lamp", { colorTemp: true }),
      b.plug("Monitor", 35),
      b.plug("Printer", 15),
      b.climateSensor("Office Climate"),
      b.contact("window", "Office Window"),
      b.cover("Office Blinds"),
    ]),
    room("bedroom", "Bedroom", "upstairs", (b) => [
      b.light("Bedroom Ceiling", { id: "light.bedroom_ceiling", colorTemp: true }),
      b.light("Desk RGB", { id: "light.desk_rgb", color: true, colorTemp: true }),
      b.light("Bedroom Bedside Left"),
      b.light("Bedroom Bedside Right"),
      b.climate("Bedroom AC", {
        id: "climate.bedroom_ac",
        modes: ["off", "cool", "heat", "dry", "fan_only"],
        manufacturer: "Daikin",
        model: "Split AC",
        supportedFeatures: 385,
      }),
      b.fan("Bedroom Ceiling Fan", { id: "fan.bedroom_ceiling", direction: true }),
      b.cover("Bedroom Curtains", { id: "cover.bedroom_curtains", deviceClass: "curtain" }),
      b.contact("window", "Bedroom Window", { id: "binary_sensor.window_bedroom" }),
      b.climateSensor("Bedroom Climate"),
      b.motion("Bedroom Motion"),
    ]),
    room("bathroom", "Bathroom", "upstairs", (b) => [
      b.light("Bathroom Ceiling", { id: "light.bathroom", supportedFeatures: 0 }),
      b.light("Bathroom Mirror"),
      b.fan("Bathroom Extractor", { watts: 20 }),
      b.climateSensor("Bathroom Climate"),
      b.leak("Bathroom Leak"),
      b.contact("window", "Bathroom Window"),
    ]),
    room("kids_room", "Kids Room", "upstairs", (b) => [
      b.light("Kids Room Ceiling"),
      b.light("Night Light", { color: true }),
      b.cover("Kids Room Blinds"),
      b.climateSensor("Kids Room Climate"),
      b.contact("window", "Kids Room Window"),
      b.motion("Kids Room Motion"),
    ]),
    room("guest_room", "Guest Room", "upstairs", (b) => [
      b.light("Guest Room Ceiling"),
      b.light("Guest Room Bedside"),
      b.climateSensor("Guest Room Climate"),
      b.contact("window", "Guest Room Window"),
    ]),
    room("landing", "Landing", "upstairs", (b) => [
      b.light("Landing Ceiling"),
      b.motion("Landing Motion"),
      b.smoke("Landing Smoke"),
    ]),
    room("garden", "Garden", "ground", (b) => [
      b.light("Path Lights", { dimmable: false }),
      b.light("Terrace"),
      b.switchDevice("Irrigation", { watts: 10 }),
      b.plug("Pond Pump", 60),
      b.climateSensor("Weather Station", { temperatureId: "sensor.temperature_outdoor", outdoor: true }),
      b.motion("Garden Motion"),
      b.contact("door", "Garden Gate"),
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
    b.energyMeter("Home", { key: "energy_meter", entityName: "Consumption" }),
    b.fixedSensor("Power Consumption", { value: 1.2, unit: "kW", deviceClass: "power" }),
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
    b.button("Restart Home Assistant", { category: "config", deviceClass: "restart" }),
    b.button("Update Firmware", { category: "config", deviceClass: "update" }),
    b.scene("Good Morning", [
      { domain: "cover", service: "open_cover", entityIds: ["cover.bedroom_curtains"] },
      { domain: "light", service: "turn_on", entityIds: ["light.kitchen_counter"] },
      { domain: "switch", service: "turn_on", entityIds: ["switch.coffee_machine"] },
    ]),
    b.scene("Good Night", [ALL_LIGHTS_OFF, ALL_LOCKS_LOCKED, { domain: "cover", service: "close_cover" }]),
    b.scene("Away", [ALL_LIGHTS_OFF, ALL_LOCKS_LOCKED]),
    ...WEATHER_FIXTURES.map((w) => b.weatherShowcase(w)),
  ]),
};
