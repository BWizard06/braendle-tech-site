import type { Locale } from '../i18n';

export type ClipCategory = 'gestures' | 'movement' | 'emotions' | 'play';
export interface StudioClip { index: number; name: string; duration: number }

const labels: Record<string, [string, string, ClipCategory]> = {
  greet_04: ['Grüssen 04', 'Greeting 04', 'gestures'],
  bow: ['Verbeugung', 'Bow', 'gestures'],
  clap: ['Klatschen', 'Applause', 'gestures'],
  agree: ['Zustimmen', 'Agree', 'gestures'],
  wave_goodbye_01: ['Verabschieden', 'Wave goodbye', 'gestures'],
  wait: ['Warten', 'Waiting', 'gestures'],
  walk: ['Gehen', 'Walk', 'movement'],
  run: ['Rennen', 'Run', 'movement'],
  flip: ['Salto', 'Flip', 'movement'],
  jump_down: ['Herunterspringen', 'Jump down', 'movement'],
  fall: ['Hinfallen', 'Fall', 'movement'],
  front_kick_02: ['Frontkick', 'Front kick', 'movement'],
  dance_06: ['Tanz 06', 'Dance 06', 'play'],
  play_video_game: ['Gaming', 'Gaming', 'play'],
  press_up: ['Liegestütze', 'Push-ups', 'play'],
  warm_up: ['Aufwärmen', 'Warm-up', 'play'],
  complain_01: ['Beschweren 01', 'Complain 01', 'emotions'],
  complain_02: ['Beschweren 02', 'Complain 02', 'emotions'],
  cry: ['Weinen', 'Cry', 'emotions'],
  frustrated_02: ['Frustriert', 'Frustrated', 'emotions'],
  sob: ['Schluchzen', 'Sob', 'emotions'],
  hit_to_body_02: ['Treffer einstecken', 'Take a hit', 'emotions'],
};

export function clipDetails(name: string, locale: Locale) {
  const entry = labels[name.toLowerCase().replaceAll('-', '_')];
  return {
    label: entry?.[locale === 'de' ? 0 : 1] ?? name.replaceAll(/[_-]/g, ' ').replace(/^./, c => c.toUpperCase()),
    category: entry?.[2] ?? 'play',
  };
}

/** Keep every track and the source clip intact; only neutralise horizontal hip travel. */
export function stationaryPositions(values: ArrayLike<number>, x: number, z: number): Float32Array {
  const result = Float32Array.from(values);
  for (let i = 0; i < result.length; i += 3) {
    result[i] = x;
    result[i + 2] = z;
  }
  return result;
}
