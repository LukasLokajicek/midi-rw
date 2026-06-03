export const midi_letter_pitches = {a: 21, b: 23, c: 12, d: 14, e: 16, f: 17, g: 19} as const;

export const midi_pitches_letter = {
    '12': 'c', '13': 'c#', '14': 'd', '15': 'd#', '16': 'e', '17': 'f',
    '18': 'f#', '19': 'g', '20': 'g#', '21': 'a', '22': 'a#', '23': 'b',
} as const;

export const midi_flattened_notes = {
    'a#': 'bb', 'c#': 'db', 'd#': 'eb', 'f#': 'gb', 'g#': 'ab',
} as const;

export function midiPitchFromNote(n: string): number {
    const matches = /([a-g])(#+|b+)?(-?[0-9]+)$/i.exec(n);
    if (!matches) throw new Error(`Invalid note: ${n}`);
    const note = matches[1].toLowerCase() as keyof typeof midi_letter_pitches;
    const accidental = matches[2] || '';
    const octave = parseInt(matches[3], 10);
    return (12 * octave) + midi_letter_pitches[note] + (accidental.substr(0, 1) === '#' ? 1 : -1) * accidental.length;
}

export function ensureMidiPitch(p: string | number): number {
    if (typeof p === 'number' || !/[^0-9]/.test(p as string)) {
        return parseInt(p as string, 10);
    }
    return midiPitchFromNote(p as string);
}

export function noteFromMidiPitch(n: number, returnFlattened = false): string {
    const octave = Math.floor(n / 12) - 1;
    const noteNum = n - octave * 12;

    const key = noteNum.toString() as keyof typeof midi_pitches_letter;
    let noteName: string = midi_pitches_letter[key];
    if (returnFlattened && noteName.indexOf('#') > 0) {
        noteName = midi_flattened_notes[noteName as keyof typeof midi_flattened_notes];
    }
    return noteName + octave;
}

export function mpqnFromBpm(bpm: number): number[] {
    let mpqn = Math.floor(60000000 / bpm);
    const ret: number[] = [];
    do {
        ret.unshift(mpqn & 0xFF);
        mpqn >>= 8;
    } while (mpqn);
    while (ret.length < 3) {
        ret.unshift(0);
    }
    return ret;
}

export function bpmFromMpqn(mpqn: number | number[]): number {
    let m: number;
    if (Array.isArray(mpqn)) {
        m = 0;
        for (let i = 0; i < mpqn.length; i++) {
            m = (m << 8) | mpqn[i];
        }
    } else {
        m = mpqn;
    }
    return Math.floor(60000000 / m);
}

export function codes2Str(byteArray: number[]): string {
    return String.fromCharCode.apply(null, byteArray);
}

export function str2Bytes(str: string, finalBytes?: number): number[] {
    let s = str;
    if (finalBytes) {
        while ((s.length / 2) < finalBytes) {
            s = '0' + s;
        }
    }

    const bytes: number[] = [];
    for (let i = s.length - 1; i >= 0; i = i - 2) {
        const chars = i === 0 ? s[i] : s[i - 1] + s[i];
        bytes.unshift(parseInt(chars, 16));
    }

    return bytes;
}

export function translateTickTime(ticks: number): number[] {
    let buffer = ticks & 0x7F;
    let t = ticks >> 7;

    while (t) {
        buffer <<= 8;
        buffer |= ((t & 0x7F) | 0x80);
        t = t >> 7;
    }

    const bList: number[] = [];
    while (true) {
        bList.push(buffer & 0xff);
        if (buffer & 0x80) {
            buffer >>= 8;
        } else {
            break;
        }
    }
    return bList;
}
