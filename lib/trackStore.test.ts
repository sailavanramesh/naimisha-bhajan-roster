import { describe, it, expect, afterEach } from 'vitest';
import {
  ACCEPTED,
  SERVED_EXTENSIONS,
  CONTENT_TYPE,
  MAX_BYTES,
  BUDGET_BYTES,
  extensionFor,
  isSafeStoredName,
  storedName,
  trackPath,
  displayName,
  humanSize,
  checkUpload,
  tracksDir,
} from './trackStore';

const original = process.env.TRACKS_DIR;
afterEach(() => {
  if (original === undefined) delete process.env.TRACKS_DIR;
  else process.env.TRACKS_DIR = original;
});

describe('where tracks live', () => {
  it('honours TRACKS_DIR when set', () => {
    process.env.TRACKS_DIR = '/tmp/somewhere';
    expect(tracksDir()).toBe('/tmp/somewhere');
  });

  it('never lands under wwwroot, which a deploy replaces', () => {
    delete process.env.TRACKS_DIR;
    expect(tracksDir()).not.toContain('wwwroot');
  });
});

describe('what may be uploaded', () => {
  it('maps every accepted type to an extension we can serve', () => {
    for (const [type, ext] of Object.entries(ACCEPTED)) {
      expect(SERVED_EXTENSIONS, type).toContain(ext);
      expect(CONTENT_TYPE[ext], ext).toBeTruthy();
    }
  });

  it('reads a content type with parameters on it', () => {
    expect(extensionFor('audio/mpeg')).toBe('mp3');
    expect(extensionFor('audio/mpeg; charset=binary')).toBe('mp3');
    expect(extensionFor('  AUDIO/MPEG  ')).toBe('mp3');
  });

  it('refuses what a browser may not play', () => {
    for (const bad of ['audio/flac', 'video/mp4', 'application/octet-stream', '', null, undefined]) {
      expect(extensionFor(bad), String(bad)).toBeNull();
    }
  });

  it('refuses a file over the size limit, and says how big it was', () => {
    const r = checkUpload({ contentType: 'audio/mpeg', declaredBytes: MAX_BYTES + 1, usedBytes: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('30.0 MB');
  });

  it('accepts one at exactly the limit', () => {
    expect(checkUpload({ contentType: 'audio/mpeg', declaredBytes: MAX_BYTES, usedBytes: 0 }).ok).toBe(true);
  });

  it('refuses when the storage budget is spent, since the plan is shared', () => {
    const r = checkUpload({ contentType: 'audio/mpeg', declaredBytes: 1000, usedBytes: BUDGET_BYTES });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/storage/i);
  });

  it('accepts an unknown length, which a streamed upload has', () => {
    expect(checkUpload({ contentType: 'audio/mpeg', declaredBytes: null, usedBytes: 0 }).ok).toBe(true);
  });
});

describe('stored names reach the filesystem, so they are checked not trusted', () => {
  it('accepts what we generate', () => {
    const name = storedName('clx1a2b3c4d5e6f7g8h9', 'mp3');
    expect(name).toBe('clx1a2b3c4d5e6f7g8h9.mp3');
    expect(isSafeStoredName(name)).toBe(true);
    expect(trackPath(name)).toContain(name);
  });

  it('refuses anything that could climb out of the folder', () => {
    for (const bad of [
      '../../etc/passwd',
      '..%2f..%2fetc%2fpasswd',
      'a/b.mp3',
      'a\\b.mp3',
      '.mp3',
      'track.mp3.exe',
      'abc.sh',
      'abc.mp3 ',
      '',
      null,
      undefined,
    ]) {
      expect(isSafeStoredName(bad as string), String(bad)).toBe(false);
      expect(trackPath(bad as string), String(bad)).toBeNull();
    }
  });

  it('refuses an extension we would not serve', () => {
    expect(isSafeStoredName('clx1a2b3c4d5e6f7g8h9.flac')).toBe(false);
  });
});

describe('display', () => {
  it('strips any path a browser sends with the filename', () => {
    expect(displayName('C:\\Users\\me\\Bhajan take 2.mp3')).toBe('Bhajan take 2.mp3');
    expect(displayName('/home/x/y/track.mp3')).toBe('track.mp3');
  });

  it('never returns an empty label', () => {
    expect(displayName('')).toBe('track');
    expect(displayName(null)).toBe('track');
    expect(displayName('   ')).toBe('track');
  });

  it('reads sizes the way a person would', () => {
    expect(humanSize(512)).toBe('512 B');
    expect(humanSize(2048)).toBe('2 KB');
    expect(humanSize(7 * 1024 * 1024)).toBe('7.0 MB');
  });
});

describe('filenames arriving from a browser header', () => {
  it('decodes what the client percent-encoded', () => {
    expect(displayName(encodeURIComponent('Śrī Rāma bhajan.mp3'))).toBe('Śrī Rāma bhajan.mp3');
    expect(displayName(encodeURIComponent('take 2 (final).m4a'))).toBe('take 2 (final).m4a');
  });

  it('survives a malformed encoding rather than failing the upload', () => {
    // decodeURIComponent throws on a stray %; an upload that has already landed
    // must not be lost over a label.
    expect(displayName('100%.mp3')).toBe('100%.mp3');
  });

  it('still strips a path after decoding', () => {
    expect(displayName(encodeURIComponent('C:\\music\\Śrī.mp3'))).toBe('Śrī.mp3');
  });
});
