import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { allowedFormats, calculateHomeworkGradePercent, homeworkCalendarProjectionId, isSafeCourseworkObjectKey, MAX_COURSEWORK_FILE_BYTES, publishedHomeworkNoticeKey, selectUniqueAssessmentComponents, splitFormMetadataAndFiles, studentHomeworkScope, studentMaterialScope, submissionStatus, validExternalUrl, validHomeworkSubmission, validateCourseworkUpload } from "./coursework-core";

describe("coursework core", () => {
  it("accepts only safe external HTTPS links", () => {
    assert.equal(validExternalUrl("https://example.edu/task"), "https://example.edu/task");
    assert.equal(validExternalUrl("http://example.edu"), null);
    assert.equal(validExternalUrl("https://user:pass@example.edu"), null);
    assert.equal(validExternalUrl("javascript:alert(1)"), null);
  });
  it("enforces exactly one teacher-allowed answer format", () => {
    assert.deepEqual(allowedFormats({ allowText: true, allowFile: false, allowLink: true }), ["TEXT", "LINK"]);
    assert.equal(validHomeworkSubmission({ text: "answer", link: "", hasFile: false, allowText: true, allowLink: false, allowFile: false }).ok, true);
    assert.equal(validHomeworkSubmission({ text: "answer", link: "https://example.edu", hasFile: false, allowText: true, allowLink: true, allowFile: false }).ok, false);
    assert.equal(validHomeworkSubmission({ text: "", link: "https://example.edu", hasFile: false, allowText: false, allowLink: true, allowFile: false }).ok, true);
    assert.equal(validHomeworkSubmission({ text: "", link: "", hasFile: true, allowText: false, allowLink: false, allowFile: true }).ok, true);
  });
  it("keeps review and revision states ahead of deadline labels", () => {
    const now = new Date("2026-11-19T12:00:00Z");
    assert.equal(submissionStatus({ published: true, deadline: new Date("2026-11-18T12:00:00Z"), now, state: "UNDER_REVIEW" }), "UNDER_REVIEW");
    assert.equal(submissionStatus({ published: true, deadline: new Date("2026-11-18T12:00:00Z"), now, state: "REVISION_REQUIRED" }), "REVISION_REQUIRED");
    assert.equal(submissionStatus({ published: true, deadline: new Date("2026-11-18T12:00:00Z"), now, state: null }), "OVERDUE");
  });
  it("validates uploads by content signature and size", () => {
    assert.deepEqual(validateCourseworkUpload(new TextEncoder().encode("%PDF-1.7 sample"), "application/pdf"), { ok: true, mimeType: "application/pdf", extension: "pdf" });
    assert.equal(validateCourseworkUpload(new TextEncoder().encode("not a pdf"), "application/pdf").ok, false);
    assert.equal(validateCourseworkUpload(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]), "image/webp").ok, true);
    assert.equal(validateCourseworkUpload(new Uint8Array(8), undefined, 4).ok, false);
  });
  it("creates stable integration keys and validates grade contribution", () => {
    assert.deepEqual(homeworkCalendarProjectionId("h1"), { sourceType: "HOMEWORK", sourceId: "h1" });
    assert.equal(publishedHomeworkNoticeKey("h1", 3), "homework:h1:published:v3");
    assert.equal(calculateHomeworkGradePercent(80, 30), 24);
    assert.equal(calculateHomeworkGradePercent(4, 0), null);
  });
  it("scopes student queries to one group and only published material", () => {
    assert.deepEqual(studentHomeworkScope("group-a"), { course: { groups: { some: { groupId: "group-a" } } }, OR: [{ groupId: "group-a" }, { groupId: null, assessment: { is: { groupId: "group-a" } } }] });
    assert.deepEqual(studentMaterialScope("group-b"), { state: "PUBLISHED", publishedAt: { not: null }, audiences: { some: { groupId: "group-b" } } });
  });
  it("accepts only private coursework object key shapes", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    assert.equal(isSafeCourseworkObjectKey(`submissions/${id}/${id}.pdf`), true);
    assert.equal(isSafeCourseworkObjectKey(`../../${id}.pdf`), false);
    assert.equal(isSafeCourseworkObjectKey(`materials/${id}/${id}.exe`), false);
  });
  it("returns unique assessment components only for the selected course and assigned group", () => {
    const options = [
      { courseId: "course-a", groupIds: ["group-1", "group-2"], componentId: "component-1", componentName: "Домашние работы" },
      { courseId: "course-a", groupIds: ["group-1", "group-2"], componentId: "component-1", componentName: "Домашние работы" },
      { courseId: "course-a", groupIds: ["group-1", "group-2"], componentId: "component-2", componentName: "Проект" },
      { courseId: "course-b", groupIds: ["group-1"], componentId: "component-3", componentName: "Тесты" },
    ];
    assert.deepEqual(selectUniqueAssessmentComponents(options, "course-a", "group-1"), [options[0], options[2]]);
    assert.deepEqual(selectUniqueAssessmentComponents(options, "course-a", "group-3"), []);
    assert.deepEqual(selectUniqueAssessmentComponents(options, "course-b", "group-1"), [options[3]]);
  });
  it("keeps material file blobs out of action metadata while preserving files for API upload", () => {
    const source = new FormData();
    source.set("title", "Lecture notes");
    source.append("file", new File([new Uint8Array(1024 * 1024 + 1)], "notes.pdf", { type: "application/pdf" }));
    const { metadata, files } = splitFormMetadataAndFiles(source);
    assert.equal(metadata.get("title"), "Lecture notes");
    assert.equal(metadata.has("file"), false);
    assert.equal(files.length, 1);
    assert.equal(files[0]?.size, 1024 * 1024 + 1);
    assert.equal(MAX_COURSEWORK_FILE_BYTES, 20 * 1024 * 1024);
  });
});
