import {File, Track} from '../src';

describe('File', () => {
    describe('setTicks', () => {
        it('sets the correct ticks on valid input', () => {
            const file = new File({ticks: 1000});
            expect(file.ticks).toBe(1000);
        });

        it('throws error on non-number input', () => {
            expect(() => {
                new File({ticks: 'not a number' as unknown as number});
            }).toThrow();
        });

        it('throws error on value exceeding 32767', () => {
            expect(() => {
                new File({ticks: 85000});
            }).toThrow();
        });

        it('throws error on non-integer value', () => {
            expect(() => {
                new File({ticks: 133.7});
            }).toThrow();
        });

        it('throws error on ticks = 0', () => {
            expect(() => new File({ticks: 0})).toThrow();
        });

        it('throws error on negative ticks', () => {
            expect(() => new File({ticks: -1})).toThrow();
        });
    });

    describe('toBlob', () => {
        it('returns a Blob with audio/x-midi MIME type by default', () => {
            const file = new File();
            file.addTrack(new Track());
            const blob = file.toBlob();
            expect(blob).toBeInstanceOf(Blob);
            expect(blob.type).toBe('audio/x-midi');
        });

        it('returns a Blob with application/octet-stream when genericType=true', () => {
            const file = new File();
            file.addTrack(new Track());
            const blob = file.toBlob(true);
            expect(blob).toBeInstanceOf(Blob);
            expect(blob.type).toBe('application/octet-stream');
        });

        it('Blob size matches toUint8Array length', () => {
            const file = new File();
            file.addTrack(new Track());
            expect(file.toBlob().size).toBe(file.toUint8Array().length);
        });
    });

    describe('defaults', () => {
        it('defaults ticks to 128', () => {
            const file = new File();
            expect(file.ticks).toBe(128);
        });

        it('defaults tracks to empty array', () => {
            const file = new File();
            expect(file.tracks).toEqual([]);
        });
    });
});
