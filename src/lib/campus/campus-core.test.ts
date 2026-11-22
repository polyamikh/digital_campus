import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { answerCampusAssistant, careerMatch, chatDisplayTitle, directChatKey, parseCareerEntries, passCanTransition, safeCampusUrl, studentChatVisibilityScope, validateCareerResumeInput } from "./campus-core";

describe("campus feature core", () => {
  it("accepts only credential-free HTTPS links", () => {
    assert.equal(safeCampusUrl("https://jobs.example.org/vacancy"), "https://jobs.example.org/vacancy");
    assert.equal(safeCampusUrl("javascript:alert(1)"), null);
    assert.equal(safeCampusUrl("https://u:p@example.org"), null);
  });
  it("builds an order-independent direct chat key and rejects self-chat", () => {
    assert.equal(directChatKey("b", "a"), "a:b");
    assert.equal(directChatKey("a", "a"), null);
  });
  it("uses readable chat titles instead of technical slugs", () => {
    assert.equal(chatDisplayTitle({ name: "group-5013c1f2-0269-563a-9bf7-8bcdf149b5fd", kind: "GROUP", groupCode: "ЦМ-26-1" }), "Группа ЦМ-26-1");
    assert.equal(chatDisplayTitle({ name: "Маркетинговая аналитика", kind: "COURSE", courseName: "Marketing Analytics" }), "Маркетинговая аналитика");
    assert.equal(chatDisplayTitle({ name: null, kind: "DIRECT", peerName: "Алиса Соколова" }), "Алиса Соколова");
  });
  it("limits non-direct chats to the student's active group scope", () => {
    assert.deepEqual(studentChatVisibilityScope([]), { OR: [{ kind: "DIRECT" }] });
    assert.deepEqual(studentChatVisibilityScope(["group-a"]), { OR: [{ kind: "DIRECT" }, { kind: "GROUP", groupId: { in: ["group-a"] } }, { kind: "COURSE", course: { groups: { some: { groupId: { in: ["group-a"] } } } } }] });
  });
  it("matches resume skills deterministically against opportunity terms", () => {
    assert.deepEqual(careerMatch(["SEO", "Excel", "SEO"], "Роль требует SEO и аналитика"), { matched: ["SEO"], score: 50 });
  });
  it("validates and normalizes a student's resume fields", () => {
    assert.deepEqual(validateCareerResumeInput({ headline: "  Analyst ", summary: "  About me ", skills: "SQL\n Excel\nSQL" }), { ok: true, headline: "Analyst", summary: "About me", skills: ["SQL", "Excel"] });
    assert.equal(validateCareerResumeInput({ headline: "x".repeat(201), summary: "", skills: "" }).ok, false);
  });
  it("parses bounded resume experience and project rows", () => {
    assert.deepEqual(parseCareerEntries("ОПЫТ | Analyst | Lab | SQL reports\nПРОЕКТ | Market map | | Public research"), { ok: true, entries: [{ kind: "EXPERIENCE", title: "Analyst", organization: "Lab", description: "SQL reports", position: 0 }, { kind: "PROJECT", title: "Market map", organization: null, description: "Public research", position: 1 }] });
    assert.equal(parseCareerEntries("ДРУГОЕ | Title").ok, false);
  });
  it("returns a transparent study helper response without other students' data", () => {
    const reply = answerCampusAssistant({ mode: "STUDY_PLANNER", question: "Что скоро сдавать?", upcomingItems: [{ title: "Marketing Analytics", date: "20 ноября" }], skills: [], opportunityTitles: [] });
    assert.match(reply, /20 ноября/);
    assert.match(reply, /вашей группы/);
  });
  it("labels the career helper as deterministic and handles an empty resume", () => {
    assert.match(answerCampusAssistant({ mode: "CAREER_ASSISTANT", question: "match", upcomingItems: [], skills: [], opportunityTitles: [] }), /языковой модели/);
  });
  it("permits only forward pass processing transitions", () => {
    assert.equal(passCanTransition("SUBMITTED", "IN_REVIEW"), true);
    assert.equal(passCanTransition("APPROVED", "ISSUED"), true);
    assert.equal(passCanTransition("ISSUED", "SUBMITTED"), false);
  });
});
