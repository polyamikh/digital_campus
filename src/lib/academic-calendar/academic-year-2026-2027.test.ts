import assert from "node:assert/strict";
import { test } from "node:test";
import { getDefaultAcademicSemester, isWithinAcademicSemester } from "./academic-year-2026-2027";

test("default semester changes on the Moscow date 2027-02-08", () => {
  assert.equal(getDefaultAcademicSemester(new Date("2027-02-07T20:59:59.999Z")), "AUTUMN");
  assert.equal(getDefaultAcademicSemester(new Date("2027-02-07T21:00:00.000Z")), "SPRING");
});

test("default is autumn before spring cutover and spring thereafter", () => {
  assert.equal(getDefaultAcademicSemester(new Date("2026-11-17T12:00:00.000Z")), "AUTUMN");
  assert.equal(getDefaultAcademicSemester(new Date("2027-07-01T12:00:00.000Z")), "SPRING");
});

test("calendar periods use inclusive Moscow date boundaries", () => {
  assert.equal(isWithinAcademicSemester(new Date("2026-08-31T21:00:00.000Z"), "AUTUMN"), true);
  assert.equal(isWithinAcademicSemester(new Date("2027-01-01T00:00:00.000Z"), "AUTUMN"), false);
  assert.equal(isWithinAcademicSemester(new Date("2027-02-07T21:00:00.000Z"), "SPRING"), true);
  assert.equal(isWithinAcademicSemester(new Date("2027-05-29T20:59:59.999Z"), "SPRING"), true);
  assert.equal(isWithinAcademicSemester(new Date("2027-05-29T21:00:00.000Z"), "SPRING"), false);
});
