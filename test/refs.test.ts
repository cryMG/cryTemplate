import { assert } from 'chai';

import dayjs from 'dayjs';

import {
  refs,
  setDayjsTemplateReference,
} from '../src/refs.js';

describe('refs', function () {
  let prevDayjsRef: typeof refs.dayjs;

  beforeEach(function () {
    prevDayjsRef = refs.dayjs;
  });

  afterEach(function () {
    refs.dayjs = prevDayjsRef;
  });

  it('setDayjsTemplateReference sets the dayjs reference', function () {
    setDayjsTemplateReference(dayjs);
    assert.strictEqual(refs.dayjs, dayjs);
  });

  it('setDayjsTemplateReference clears the dayjs reference when passed null', function () {
    setDayjsTemplateReference(dayjs);
    assert.strictEqual(refs.dayjs, dayjs);

    setDayjsTemplateReference(null);
    assert.strictEqual(refs.dayjs, null);
  });

  it('setDayjsTemplateReference rejects invalid references', function () {
    assert.throws(() => {
      // @ts-expect-error Testing invalid input
      setDayjsTemplateReference(42);
    }, TypeError, 'Invalid Dayjs reference');

    assert.throws(() => {
      // Function but missing `isDayjs` marker
      // @ts-expect-error Testing invalid input
      setDayjsTemplateReference(() => ({ isValid: () => true, format: () => '' }));
    }, TypeError, 'Invalid Dayjs reference');
  });
});
