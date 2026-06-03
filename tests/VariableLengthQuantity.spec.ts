/**
 * Tests for translateTickTime against the MIDI specification's variable-length
 * quantity (VLQ) encoding rules.
 *
 * Reference: "Standard MIDI Files 1.0" specification, section on variable-length
 * quantities. The 12 test vectors below are taken directly from that spec table.
 *
 * VLQ encoding rules:
 *   - Each byte contributes its lower 7 bits to the value.
 *   - Bit 7 of each byte is a continuation flag: 1 = more bytes follow, 0 = last byte.
 *   - Values are encoded big-endian (most-significant group first).
 *   - Maximum representable value is 0x0FFFFFFF (4 bytes × 7 bits).
 */

import {translateTickTime} from '../src/Util';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true when every byte except the last has bit 7 set. */
function allContinuationBytesSet(bytes: number[]): boolean {
    for (let i = 0; i < bytes.length - 1; i++) {
        if ((bytes[i] & 0x80) === 0) return false;
    }
    return true;
}

/** Returns true when the last byte has bit 7 clear. */
function lastByteHasBit7Clear(bytes: number[]): boolean {
    return (bytes[bytes.length - 1] & 0x80) === 0;
}

// ---------------------------------------------------------------------------
// 1. Official spec encoding examples
// ---------------------------------------------------------------------------

describe('translateTickTime — MIDI spec encoding examples', () => {
    /**
     * The following table is reproduced verbatim from the MIDI 1.0 Standard
     * File specification. Each row is: (decimal value, hex value, expected bytes).
     */
    const specExamples: Array<{label: string; value: number; expected: number[]}> = [
        {label: '0x00000000',  value: 0x00000000, expected: [0x00]},
        {label: '0x00000040',  value: 0x00000040, expected: [0x40]},
        {label: '0x0000007F',  value: 0x0000007F, expected: [0x7F]},
        {label: '0x00000080',  value: 0x00000080, expected: [0x81, 0x00]},
        {label: '0x00002000',  value: 0x00002000, expected: [0xC0, 0x00]},
        {label: '0x00003FFF',  value: 0x00003FFF, expected: [0xFF, 0x7F]},
        {label: '0x00004000',  value: 0x00004000, expected: [0x81, 0x80, 0x00]},
        {label: '0x00100000',  value: 0x00100000, expected: [0xC0, 0x80, 0x00]},
        {label: '0x001FFFFF',  value: 0x001FFFFF, expected: [0xFF, 0xFF, 0x7F]},
        {label: '0x00200000',  value: 0x00200000, expected: [0x81, 0x80, 0x80, 0x00]},
        {label: '0x08000000',  value: 0x08000000, expected: [0xC0, 0x80, 0x80, 0x00]},
        {label: '0x0FFFFFFF',  value: 0x0FFFFFFF, expected: [0xFF, 0xFF, 0xFF, 0x7F]},
    ];

    test.each(specExamples)(
        'encodes $label correctly',
        ({value, expected}) => {
            expect(translateTickTime(value)).toEqual(expected);
        }
    );
});

// ---------------------------------------------------------------------------
// 2. Boundary cases not present in the spec table
// ---------------------------------------------------------------------------

describe('translateTickTime — boundary cases', () => {
    it('encodes 255 (0xFF) as two bytes', () => {
        // 255 = 0b11111111; split into [1 1111111] → [0x81, 0x7F].
        expect(translateTickTime(255)).toEqual([0x81, 0x7F]);
    });

    it('encodes 256 (0x100) as two bytes', () => {
        // 256 = 0b100000000; split into [10 0000000] → [0x82, 0x00].
        expect(translateTickTime(256)).toEqual([0x82, 0x00]);
    });
});

// ---------------------------------------------------------------------------
// 3. Structural property: bit 7 of each byte
// ---------------------------------------------------------------------------

describe('translateTickTime — bit 7 continuation flag invariants', () => {
    const sampleValues = [
        0,
        1,
        0x40,
        0x7F,
        0x80,
        0x3FFF,
        0x4000,
        0x1FFFFF,
        0x200000,
        0x0FFFFFFF,
    ];

    it.each(sampleValues)(
        'last byte of encoding for %i always has bit 7 clear',
        (value) => {
            const bytes = translateTickTime(value);
            expect(lastByteHasBit7Clear(bytes)).toBe(true);
        }
    );

    it.each(sampleValues)(
        'all bytes except the last for %i have bit 7 set',
        (value) => {
            const bytes = translateTickTime(value);
            expect(allContinuationBytesSet(bytes)).toBe(true);
        }
    );

    it('single-byte result has no continuation byte (bit 7 of only byte is clear)', () => {
        // Any value 0–127 must produce a single byte with bit 7 == 0.
        for (const v of [0, 1, 63, 64, 127]) {
            const [byte] = translateTickTime(v);
            expect(byte & 0x80).toBe(0);
        }
    });
});

// ---------------------------------------------------------------------------
// 4. Encoded length as a function of value range
// ---------------------------------------------------------------------------

describe('translateTickTime — encoded byte length by value range', () => {
    describe('1-byte range: 0 to 127 (0x00–0x7F)', () => {
        it('encodes 0 in 1 byte', () => {
            expect(translateTickTime(0)).toHaveLength(1);
        });

        it('encodes 1 in 1 byte', () => {
            expect(translateTickTime(1)).toHaveLength(1);
        });

        it('encodes 64 (0x40) in 1 byte', () => {
            expect(translateTickTime(0x40)).toHaveLength(1);
        });

        it('encodes 127 (0x7F) in 1 byte — boundary', () => {
            expect(translateTickTime(0x7F)).toHaveLength(1);
        });
    });

    describe('2-byte range: 128 to 16383 (0x80–0x3FFF)', () => {
        it('encodes 128 (0x80) in 2 bytes — lower boundary', () => {
            expect(translateTickTime(0x80)).toHaveLength(2);
        });

        it('encodes 8192 (0x2000) in 2 bytes — mid range', () => {
            expect(translateTickTime(0x2000)).toHaveLength(2);
        });

        it('encodes 16383 (0x3FFF) in 2 bytes — upper boundary', () => {
            expect(translateTickTime(0x3FFF)).toHaveLength(2);
        });
    });

    describe('3-byte range: 16384 to 2097151 (0x4000–0x1FFFFF)', () => {
        it('encodes 16384 (0x4000) in 3 bytes — lower boundary', () => {
            expect(translateTickTime(0x4000)).toHaveLength(3);
        });

        it('encodes 1048576 (0x100000) in 3 bytes — mid range', () => {
            expect(translateTickTime(0x100000)).toHaveLength(3);
        });

        it('encodes 2097151 (0x1FFFFF) in 3 bytes — upper boundary', () => {
            expect(translateTickTime(0x1FFFFF)).toHaveLength(3);
        });
    });

    describe('4-byte range: 2097152 to 268435455 (0x200000–0x0FFFFFFF)', () => {
        it('encodes 2097152 (0x200000) in 4 bytes — lower boundary', () => {
            expect(translateTickTime(0x200000)).toHaveLength(4);
        });

        it('encodes 134217728 (0x8000000) in 4 bytes — mid range', () => {
            expect(translateTickTime(0x8000000)).toHaveLength(4);
        });

        it('encodes 268435455 (0x0FFFFFFF) in 4 bytes — upper boundary', () => {
            expect(translateTickTime(0x0FFFFFFF)).toHaveLength(4);
        });
    });
});
