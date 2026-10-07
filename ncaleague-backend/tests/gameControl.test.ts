import { expect, test, describe } from 'bun:test';
import { isAbandoned } from 'src/gameControl';

describe('Abandoned game', () => {
  const lastActivity = new Date('2026-10-07T12:00:00Z');

  test('is active for 60 minutes after its last goal or match', () => {
    expect(isAbandoned(lastActivity, new Date('2026-10-07T12:59:59Z'))).toBe(false);
  });

  test('is abandoned after 60 minutes', () => {
    expect(isAbandoned(lastActivity, new Date('2026-10-07T13:00:00Z'))).toBe(true);
  });
});
