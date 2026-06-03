import {
    MidiData, MidiHeader, MidiTrack, MidiEvent,
    MidiChannelEvent, MidiMetaEvent, ParseError,
} from './MidiData';
import {bpmFromMpqn} from './Util';

// ---------------------------------------------------------------------------
// Variable-length quantity decoder
// ---------------------------------------------------------------------------

function readVarLen(bytes: Uint8Array, offset: number): { value: number; bytesRead: number } {
    let value = 0;
    let bytesRead = 0;
    let b: number;
    do {
        if (offset + bytesRead >= bytes.length) {
            throw new RangeError('Unexpected end of data reading variable-length quantity');
        }
        b = bytes[offset + bytesRead];
        value = (value << 7) | (b & 0x7F);
        bytesRead++;
    } while (b & 0x80);
    return {value, bytesRead};
}

function readUint16BE(bytes: Uint8Array, offset: number): number {
    return ((bytes[offset] << 8) | bytes[offset + 1]) >>> 0;
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
    return (
        ((bytes[offset] << 24) | (bytes[offset + 1] << 16) |
         (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
    );
}

// ---------------------------------------------------------------------------
// Header parser
// ---------------------------------------------------------------------------

function parseHeader(
    bytes: Uint8Array,
    errors: ParseError[],
): { header: MidiHeader; bytesConsumed: number } {
    if (bytes.length < 14) {
        errors.push({offset: 0, message: 'File too short to contain a valid MThd header'});
        return {
            header: {format: 0, numTracks: 0},
            bytesConsumed: bytes.length,
        };
    }

    // Chunk ID: "MThd"
    if (bytes[0] !== 0x4D || bytes[1] !== 0x54 || bytes[2] !== 0x68 || bytes[3] !== 0x64) {
        errors.push({offset: 0, message: 'Invalid chunk ID: expected "MThd"'});
    }

    const chunkLength = readUint32BE(bytes, 4);
    if (chunkLength < 6) {
        errors.push({offset: 4, message: `MThd chunk length ${chunkLength} is less than 6`});
    }

    const format = readUint16BE(bytes, 8) as 0 | 1 | 2;
    if (format > 1) {
        errors.push({offset: 8, message: `MIDI format ${format} is not fully supported (only 0 and 1 are)`});
    }

    const numTracks = readUint16BE(bytes, 10);
    const timeDivision = readUint16BE(bytes, 12);

    let header: MidiHeader;
    if (timeDivision & 0x8000) {
        // SMPTE time
        header = {
            format,
            numTracks,
            framesPerSecond: -(timeDivision >> 8),
            ticksPerFrame: timeDivision & 0xFF,
        };
    } else {
        header = {format, numTracks, ticksPerBeat: timeDivision};
    }

    return {header, bytesConsumed: 8 + chunkLength};
}

// ---------------------------------------------------------------------------
// Channel event parser
// ---------------------------------------------------------------------------

const CHANNEL_SUBTYPES: Record<number, MidiChannelEvent['subtype']> = {
    0x8: 'noteOff',
    0x9: 'noteOn',
    0xA: 'noteAftertouch',
    0xB: 'controller',
    0xC: 'programChange',
    0xD: 'channelAftertouch',
    0xE: 'pitchBend',
};

const ONE_PARAM_EVENTS = new Set([0xC, 0xD]); // programChange, channelAftertouch

function parseChannelEvent(
    status: number,
    bytes: Uint8Array,
    offset: number,
    deltaTime: number,
): { event: MidiChannelEvent; bytesRead: number } {
    const typeNibble = (status >> 4) & 0xF;
    const channel = status & 0xF;
    let subtype = CHANNEL_SUBTYPES[typeNibble];
    const param1 = bytes[offset];
    let bytesRead = 1;
    let param2: number | undefined;

    if (!ONE_PARAM_EVENTS.has(typeNibble)) {
        param2 = bytes[offset + 1];
        bytesRead = 2;
    }

    // velocity=0 noteOn is equivalent to noteOff per MIDI spec
    if (subtype === 'noteOn' && param2 === 0) {
        subtype = 'noteOff';
    }

    const event: MidiChannelEvent = {type: 'channel', subtype, deltaTime, channel, param1, param2};

    // Populate semantic aliases
    if (subtype === 'noteOn' || subtype === 'noteOff' || subtype === 'noteAftertouch') {
        event.noteNumber = param1;
        event.velocity = param2;
    }
    if (subtype === 'noteAftertouch') {
        event.value = param2;
    }
    if (subtype === 'controller') {
        event.controller = param1;
        event.value = param2;
    }
    if (subtype === 'programChange') {
        event.program = param1;
    }
    if (subtype === 'channelAftertouch') {
        event.pressure = param1;
        event.value = param1;
    }
    if (subtype === 'pitchBend') {
        // 14-bit value: LSB in param1, MSB in param2
        event.value = param2 !== undefined ? (param2 << 7) | param1 : param1;
    }

    return {event, bytesRead};
}

// ---------------------------------------------------------------------------
// Meta event parser
// ---------------------------------------------------------------------------

const TEXT_META_SUBTYPES: Record<number, MidiMetaEvent['subtype']> = {
    0x01: 'text',
    0x02: 'copyright',
    0x03: 'trackName',
    0x04: 'instrument',
    0x05: 'lyric',
    0x06: 'marker',
    0x07: 'cuePoint',
};

function parseMetaEvent(
    bytes: Uint8Array,
    offset: number,
    deltaTime: number,
    errors: ParseError[],
): { event: MidiMetaEvent; bytesRead: number } {
    const metaType = bytes[offset];
    const {value: dataLength, bytesRead: vlqBytes} = readVarLen(bytes, offset + 1);
    const dataStart = offset + 1 + vlqBytes;
    const data = Array.from(bytes.subarray(dataStart, dataStart + dataLength));
    const totalBytesRead = 1 + vlqBytes + dataLength; // type + vlq length + data

    const base: Omit<MidiMetaEvent, 'subtype'> = {
        type: 'meta', deltaTime, metaType, data,
    };

    if (metaType === 0x00) {
        return {event: {...base, subtype: 'sequenceNumber'}, bytesRead: totalBytesRead};
    }

    if (TEXT_META_SUBTYPES[metaType]) {
        const text = data.map(b => String.fromCharCode(b)).join('');
        return {
            event: {...base, subtype: TEXT_META_SUBTYPES[metaType], text},
            bytesRead: totalBytesRead,
        };
    }

    if (metaType === 0x20) {
        return {event: {...base, subtype: 'channelPrefix'}, bytesRead: totalBytesRead};
    }

    if (metaType === 0x2F) {
        return {event: {...base, subtype: 'endOfTrack'}, bytesRead: totalBytesRead};
    }

    if (metaType === 0x51 && data.length >= 3) {
        const mpqn = (data[0] << 16) | (data[1] << 8) | data[2];
        return {
            event: {...base, subtype: 'tempo', bpm: bpmFromMpqn(mpqn)},
            bytesRead: totalBytesRead,
        };
    }

    if (metaType === 0x54) {
        return {event: {...base, subtype: 'smpteOffset'}, bytesRead: totalBytesRead};
    }

    if (metaType === 0x58 && data.length >= 2) {
        return {
            event: {
                ...base,
                subtype: 'timeSignature',
                numerator: data[0],
                denominator: Math.pow(2, data[1]),
            },
            bytesRead: totalBytesRead,
        };
    }

    if (metaType === 0x59 && data.length >= 2) {
        // data[0] is a signed byte: negative = flats, positive = sharps
        const raw = data[0];
        const accidentals = raw > 127 ? raw - 256 : raw;
        return {
            event: {...base, subtype: 'keySignature', accidentals, minor: data[1] === 1},
            bytesRead: totalBytesRead,
        };
    }

    if (metaType === 0x7F) {
        return {event: {...base, subtype: 'sequencerSpecific'}, bytesRead: totalBytesRead};
    }

    errors.push({
        offset,
        message: `Unknown meta event type 0x${metaType.toString(16).padStart(2, '0')}`,
    });
    return {event: {...base, subtype: 'unknown'}, bytesRead: totalBytesRead};
}

// ---------------------------------------------------------------------------
// Track parser
// ---------------------------------------------------------------------------

function parseTrack(
    bytes: Uint8Array,
    trackStart: number,
    dataLength: number,
    errors: ParseError[],
): MidiTrack {
    const events: MidiEvent[] = [];
    let offset = trackStart;
    const end = trackStart + dataLength;
    let lastStatus = 0;

    while (offset < end) {
        // Delta time
        let deltaTime: number;
        let vlqBytes: number;
        try {
            ({value: deltaTime, bytesRead: vlqBytes} = readVarLen(bytes, offset));
        } catch (e) {
            errors.push({offset, message: `Failed to read delta time: ${(e as Error).message}`});
            break;
        }
        offset += vlqBytes;

        if (offset >= end) break;

        const firstByte = bytes[offset];

        // Running status: if high bit is clear, reuse lastStatus
        let status: number;
        let dataOffset: number;
        if (firstByte & 0x80) {
            status = firstByte;
            dataOffset = offset + 1;
        } else {
            status = lastStatus;
            dataOffset = offset;
        }

        if (status === 0xFF) {
            // Meta event — resets running status
            lastStatus = 0;
            offset = dataOffset;
            try {
                const {event, bytesRead} = parseMetaEvent(bytes, offset, deltaTime, errors);
                events.push(event);
                offset += bytesRead;
                if (event.subtype === 'endOfTrack') break;
            } catch (e) {
                errors.push({offset, message: `Failed to parse meta event: ${(e as Error).message}`});
                break;
            }
        } else if (status === 0xF0 || status === 0xF7) {
            // SysEx — skip
            lastStatus = 0;
            offset = dataOffset;
            try {
                const {value: sysexLen, bytesRead: vlq} = readVarLen(bytes, offset);
                offset += vlq + sysexLen;
                errors.push({offset, message: `SysEx event skipped (${sysexLen} bytes)`});
            } catch (e) {
                errors.push({offset, message: `Failed to skip SysEx: ${(e as Error).message}`});
                break;
            }
        } else if ((status & 0x80) && CHANNEL_SUBTYPES[(status >> 4) & 0xF]) {
            // Channel event
            lastStatus = status;
            offset = dataOffset;
            try {
                const {event, bytesRead} = parseChannelEvent(status, bytes, offset, deltaTime);
                events.push(event);
                offset += bytesRead;
            } catch (e) {
                errors.push({offset, message: `Failed to parse channel event: ${(e as Error).message}`});
                break;
            }
        } else {
            errors.push({offset, message: `Unknown status byte 0x${status.toString(16)}`});
            break;
        }
    }

    return {events};
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function parseMidi(bytes: Uint8Array): MidiData {
    const errors: ParseError[] = [];

    if (bytes.length < 14) {
        errors.push({offset: 0, message: 'File too short to contain a valid MIDI header'});
        return {header: {format: 0, numTracks: 0}, tracks: [], errors};
    }

    const {header, bytesConsumed: headerSize} = parseHeader(bytes, errors);
    const tracks: MidiTrack[] = [];
    let offset = headerSize;

    for (let i = 0; i < header.numTracks; i++) {
        if (offset + 8 > bytes.length) {
            errors.push({offset, message: `Track ${i}: unexpected end of file before track chunk`});
            break;
        }

        // Chunk ID: "MTrk"
        if (bytes[offset] !== 0x4D || bytes[offset + 1] !== 0x54 ||
            bytes[offset + 2] !== 0x72 || bytes[offset + 3] !== 0x6B) {
            errors.push({
                offset,
                message: `Track ${i}: invalid chunk ID (expected "MTrk")`,
            });
        }

        const trackDataLength = readUint32BE(bytes, offset + 4);
        const trackDataStart = offset + 8;

        if (trackDataStart + trackDataLength > bytes.length) {
            errors.push({
                offset,
                message: `Track ${i}: chunk claims ${trackDataLength} bytes but only ${bytes.length - trackDataStart} remain`,
            });
        }

        tracks.push(parseTrack(bytes, trackDataStart, trackDataLength, errors));
        offset = trackDataStart + trackDataLength;
    }

    return {header, tracks, errors};
}
