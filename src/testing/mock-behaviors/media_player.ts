/**
 * Media Player domain behavior handler
 *
 * Simulates Home Assistant's media player entity behavior for:
 * - media_play: Start playback
 * - media_pause: Pause playback
 * - media_play_pause: Toggle play/pause
 * - media_stop: Stop playback
 * - media_next_track: Skip to next track
 * - media_previous_track: Skip to previous track
 * - media_seek: Seek to position
 * - volume_up: Increase volume
 * - volume_down: Decrease volume
 * - set_volume_level: Set volume level
 * - mute_volume: Mute/unmute
 * - turn_on: Turn on media player
 * - turn_off: Turn off media player
 * - toggle: Toggle power
 *
 * Uses strongly-typed MediaPlayerService from @glasshome/ha-types.
 */

import type { ServiceCall, ServiceName } from "@glasshome/ha-types";
import type { HassEntity } from "../../core/types";
import type { BehaviorResult, DomainBehavior, ServiceContext } from "./base";
import { mergeAttributes, simpleStateUpdate } from "./base";

/**
 * Example album covers for mock media players
 * Using placeholder image services that provide nice album art
 */
const EXAMPLE_ALBUM_COVERS = [
  "https://picsum.photos/seed/album8/300/300",
  "https://picsum.photos/seed/album2/300/300",
  "https://picsum.photos/seed/album3/300/300",
  "https://picsum.photos/seed/album4/300/300",
  "https://picsum.photos/seed/album5/300/300",
];

/**
 * Example tracks for mock media players
 */
const EXAMPLE_TRACKS = [
  {
    title: "Midnight Horizons",
    artist: "Synthetic Dreams",
    album: "Neon Nights",
    duration: 245,
  },
  {
    title: "Electric Pulse",
    artist: "Digital Waves",
    album: "Synth Collection",
    duration: 198,
  },
  {
    title: "Cosmic Journey",
    artist: "Space Echo",
    album: "Galaxy Sounds",
    duration: 312,
  },
  {
    title: "Urban Nights",
    artist: "City Lights",
    album: "Metropolitan",
    duration: 267,
  },
  {
    title: "Ocean Breeze",
    artist: "Coastal Vibes",
    album: "Beach Sessions",
    duration: 189,
  },
];

let currentTrackIndex = 0;

function getNextTrack() {
  const track = EXAMPLE_TRACKS[currentTrackIndex % EXAMPLE_TRACKS.length];
  currentTrackIndex++;
  return track;
}

function getCurrentTrack() {
  return EXAMPLE_TRACKS[currentTrackIndex % EXAMPLE_TRACKS.length];
}

function getAlbumCover(trackIndex: number) {
  return EXAMPLE_ALBUM_COVERS[trackIndex % EXAMPLE_ALBUM_COVERS.length];
}

export class MediaPlayerBehavior implements DomainBehavior<"media_player"> {
  readonly domain = "media_player" as const;

  handleService(
    entity: HassEntity,
    service: ServiceName<"media_player">,
    serviceData: ServiceCall<"media_player", ServiceName<"media_player">> | undefined,
    _context: ServiceContext,
  ): BehaviorResult {
    switch (service) {
      case "media_play":
        return this.handlePlay(entity);

      case "media_pause":
        return this.handlePause(entity);

      case "media_play_pause":
        return this.handlePlayPause(entity);

      case "media_stop":
        return this.handleStop(entity);

      case "media_next_track":
        return this.handleNextTrack(entity);

      case "media_previous_track":
        return this.handlePreviousTrack(entity);

      case "media_seek":
        return this.handleSeek(entity, serviceData);

      case "volume_up":
        return this.handleVolumeUp(entity);

      case "volume_down":
        return this.handleVolumeDown(entity);

      case "set_volume_level":
        return this.handleSetVolumeLevel(entity, serviceData);

      case "mute_volume":
        return this.handleMuteVolume(entity, serviceData);

      case "turn_on":
        return this.handleTurnOn(entity);

      case "turn_off":
        return this.handleTurnOff(entity);

      case "toggle":
        return this.handleToggle(entity);

      default:
        return { stateUpdate: null };
    }
  }

  private handlePlay(entity: HassEntity): BehaviorResult {
    const attributeUpdates: Record<string, unknown> = {};

    // If no media is loaded, load a track
    if (!entity.attributes.media_title) {
      const track = getCurrentTrack();
      attributeUpdates.media_title = track.title;
      attributeUpdates.media_artist = track.artist;
      attributeUpdates.media_album_name = track.album;
      attributeUpdates.media_duration = track.duration;
      attributeUpdates.media_position = 0;
      attributeUpdates.entity_picture = getAlbumCover(currentTrackIndex - 1);
    }

    // If paused, resume from current position
    if (entity.state === "paused" && entity.attributes.media_position) {
      attributeUpdates.media_position = entity.attributes.media_position;
    }

    return simpleStateUpdate({
      state: "playing",
      attributes: mergeAttributes(entity.attributes, attributeUpdates),
    });
  }

  private handlePause(entity: HassEntity): BehaviorResult {
    return simpleStateUpdate({
      state: "paused",
      attributes: entity.attributes,
    });
  }

  private handlePlayPause(entity: HassEntity): BehaviorResult {
    if (entity.state === "playing") {
      return this.handlePause(entity);
    }
    return this.handlePlay(entity);
  }

  private handleStop(entity: HassEntity): BehaviorResult {
    return simpleStateUpdate({
      state: "idle",
      attributes: mergeAttributes(entity.attributes, {
        media_position: 0,
      }),
    });
  }

  private handleNextTrack(entity: HassEntity): BehaviorResult {
    const track = getNextTrack();
    const trackIndex = currentTrackIndex - 1;

    return simpleStateUpdate({
      state: entity.state === "playing" ? "playing" : entity.state,
      attributes: mergeAttributes(entity.attributes, {
        media_title: track.title,
        media_artist: track.artist,
        media_album_name: track.album,
        media_duration: track.duration,
        media_position: 0,
        entity_picture: getAlbumCover(trackIndex),
      }),
    });
  }

  private handlePreviousTrack(entity: HassEntity): BehaviorResult {
    // Go back two tracks, then advance one (net: previous)
    currentTrackIndex = Math.max(0, currentTrackIndex - 2);
    const track = getNextTrack();
    const trackIndex = currentTrackIndex - 1;

    return simpleStateUpdate({
      state: entity.state === "playing" ? "playing" : entity.state,
      attributes: mergeAttributes(entity.attributes, {
        media_title: track.title,
        media_artist: track.artist,
        media_album_name: track.album,
        media_duration: track.duration,
        media_position: 0,
        entity_picture: getAlbumCover(trackIndex),
      }),
    });
  }

  private handleSeek(
    entity: HassEntity,
    serviceData: ServiceCall<"media_player", "media_seek"> | undefined,
  ): BehaviorResult {
    const seekPosition = serviceData?.seek_position;
    if (seekPosition === undefined) {
      return { stateUpdate: null };
    }

    const duration = (entity.attributes.media_duration as number) ?? 0;
    const newPosition = Math.max(0, Math.min(duration, seekPosition));

    return simpleStateUpdate({
      attributes: mergeAttributes(entity.attributes, {
        media_position: newPosition,
      }),
    });
  }

  private handleVolumeUp(entity: HassEntity): BehaviorResult {
    const currentVolume = (entity.attributes.volume_level as number) ?? 0;
    const newVolume = Math.min(1.0, currentVolume + 0.1);

    return simpleStateUpdate({
      attributes: mergeAttributes(entity.attributes, {
        volume_level: newVolume,
        is_volume_muted: false,
      }),
    });
  }

  private handleVolumeDown(entity: HassEntity): BehaviorResult {
    const currentVolume = (entity.attributes.volume_level as number) ?? 0;
    const newVolume = Math.max(0.0, currentVolume - 0.1);

    return simpleStateUpdate({
      attributes: mergeAttributes(entity.attributes, {
        volume_level: newVolume,
        is_volume_muted: newVolume === 0,
      }),
    });
  }

  private handleSetVolumeLevel(
    entity: HassEntity,
    serviceData: ServiceCall<"media_player", "set_volume_level"> | undefined,
  ): BehaviorResult {
    const volumeLevel = serviceData?.volume_level;
    if (volumeLevel === undefined) {
      return { stateUpdate: null };
    }

    const newVolume = Math.max(0.0, Math.min(1.0, volumeLevel));

    return simpleStateUpdate({
      attributes: mergeAttributes(entity.attributes, {
        volume_level: newVolume,
        is_volume_muted: newVolume === 0,
      }),
    });
  }

  private handleMuteVolume(
    entity: HassEntity,
    serviceData: ServiceCall<"media_player", "mute_volume"> | undefined,
  ): BehaviorResult {
    const isMuted = serviceData?.is_volume_muted ?? !entity.attributes.is_volume_muted;

    return simpleStateUpdate({
      attributes: mergeAttributes(entity.attributes, {
        is_volume_muted: isMuted,
      }),
    });
  }

  private handleTurnOn(entity: HassEntity): BehaviorResult {
    const attributeUpdates: Record<string, unknown> = {};

    // If no media is loaded, load a track
    if (!entity.attributes.media_title) {
      const track = getCurrentTrack();
      attributeUpdates.media_title = track.title;
      attributeUpdates.media_artist = track.artist;
      attributeUpdates.media_album_name = track.album;
      attributeUpdates.media_duration = track.duration;
      attributeUpdates.media_position = 0;
      attributeUpdates.entity_picture = getAlbumCover(currentTrackIndex - 1);
    }

    return simpleStateUpdate({
      state: "playing",
      attributes: mergeAttributes(entity.attributes, attributeUpdates),
    });
  }

  private handleTurnOff(entity: HassEntity): BehaviorResult {
    return simpleStateUpdate({
      state: "off",
      attributes: mergeAttributes(entity.attributes, {
        media_position: 0,
      }),
    });
  }

  private handleToggle(entity: HassEntity): BehaviorResult {
    if (entity.state === "off") {
      return this.handleTurnOn(entity);
    }
    return this.handleTurnOff(entity);
  }
}
