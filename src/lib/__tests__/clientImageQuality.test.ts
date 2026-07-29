import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessImageQuality,
  type ImageQualityMeasurements,
} from '../clientImageResize';

const clearPhoto: ImageQualityMeasurements = {
  width: 1400,
  height: 900,
  meanLuma: 130,
  darkFraction: 0.04,
  brightFraction: 0.03,
  edgeContrast: 18,
};

test('a clear, well-sized packet photo passes without an issue', () => {
  assert.deepEqual(assessImageQuality(clearPhoto), []);
});

test('a small crop is blocked rather than sent to OCR', () => {
  const issues = assessImageQuality({ ...clearPhoto, width: 500, height: 350 });
  assert.equal(issues[0]?.code, 'low_resolution');
  assert.equal(issues[0]?.severity, 'block');
});

test('low sharpness gives lens and phone-cover retake advice', () => {
  const issues = assessImageQuality({ ...clearPhoto, edgeContrast: 3 });
  const blur = issues.find((issue) => issue.code === 'blur_or_low_contrast');
  assert.equal(blur?.severity, 'warning');
  assert.match(blur?.message ?? '', /scratched or dirty phone cover/i);
});

test('dark and washed-out photos receive distinct warnings', () => {
  const dark = assessImageQuality({
    ...clearPhoto,
    meanLuma: 35,
    darkFraction: 0.55,
  });
  const bright = assessImageQuality({
    ...clearPhoto,
    meanLuma: 238,
    brightFraction: 0.6,
  });

  assert.ok(dark.some((issue) => issue.code === 'too_dark'));
  assert.ok(bright.some((issue) => issue.code === 'too_bright'));
});
