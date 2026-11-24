import { bracketRecords, saveBracket } from "./brackets";
import bcrypt from "bcryptjs";
import { isDeepStrictEqual } from "node:util";
import type { PoolClient } from "pg";
import { commandSchema, type Command } from "./validation";
import { overall } from "../scoring";
import {
  tallyAdjustments,
  totalsOnly,
  TALLY_KEYS,
  requireNonnegativeTally,
} from "./tally";
import {
  transaction,
  snapshot,
  userById,
  canAccess,
  requireAccess,
  requireAdmin,
  requireSuperadmin,
  fail,
  uid,
  hash,
  audit,
} from "./store";
import {
  awardSource,
  calculateAward,
  calculateCertifiedAward,
  findCategory,
  hypotheticalResult,
  insertRevision,
  publicAward,
  saveSchedule,
  validateResult,
} from "./competition";
import { slug } from "../catalog";
import type {
  User,
  Revision,
  ResultBody,
  AwardBody,
  Snapshot,
  Placing,
  TallyTotals,
} from "../model";

type TallyPreview = Array<TallyTotals & { collegeId: string }>;

async function checkTallyPreview(
  db: PoolClient,
  state: Snapshot,
  expected: TallyPreview | undefined,
  required = false,
  replacement?: { categoryId: string; body: AwardBody },
) {
  if (!expected) {
    if (required)
      fail("Preview the college tally before publishing this award.");
    return;
  }
  const awards = state.revisions
    .filter(
      (r) =>
        r.kind === "award" &&
        r.status === "approved" &&
        r.categoryId !== replacement?.categoryId,
    )
    .map((r) => r.body as AwardBody);
  if (replacement) awards.push(replacement.body);
  const current = overall(awards, await tallyAdjustments(db));
  if (
    expected.length !== current.length ||
    new Set(expected.map((row) => row.collegeId)).size !== current.length ||
    current.some((row) => {
      const prior = expected.find((item) => item.collegeId === row.id);
      return !prior || !isDeepStrictEqual(totalsOnly(prior), totalsOnly(row));
    })
  )
    fail(
      "The official tally changed. Reload and preview the new totals before publishing.",
      409,
    );
}

const sameAward = (a: AwardBody, b: AwardBody) =>
  isDeepStrictEqual(
    { ...a, method: a.method || "calculated" },
    { ...b, method: b.method || "calculated" },
  );

function pendingRevision(
  id: string,
  user: User,
  categoryId: string,
  scheduleId: string | null,
  kind: Revision["kind"],
  body: ResultBody | AwardBody,
  baseId: string | null,
  reason: string,
): Revision {
  return {
    id,
    categoryId,
    scheduleId,
    kind,
    body,
    baseId,
    reason,
    status: "pending",
    actorId: user.id,
    reviewNote: "",
    createdAt: new Date().toISOString(),
    reviewedAt: null,
    reviewerId: null,
  };
}

/** Both direct publication and legacy review use the same transactional checks. */
async function approveRevision(
  db: PoolClient,
  user: User,
  r: Revision,
  state: Snapshot,
  reviewNote: string,
) {
  if (r.kind === "award") {
    const body = r.body as AwardBody;
    if (
      body.source !==
      awardSource(state, r.categoryId, body.method || "calculated")
    )
      fail(
        "Results, entries or rules changed after submission. Reload and prepare this award again.",
        409,
      );
  } else {
    const schedule = state.schedules.find((s) => s.id === r.scheduleId)!;
    const body = r.body as ResultBody;
    validateResult(state, schedule, body);
    const existingAward = publicAward(state, r.categoryId);
    if (
      existingAward &&
      (existingAward.body as AwardBody).method !== "certified"
    ) {
      if (
        state.revisions.some(
          (revision) =>
            revision.categoryId === r.categoryId &&
            revision.kind === "award" &&
            ["draft", "pending"].includes(revision.status),
        )
      )
        fail(
          "Resolve the championship draft or submission before correcting this calculated result.",
          409,
        );
      const impact = calculateAward(
        hypotheticalResult(state, r),
        r.categoryId,
        body.awardPlacings || [],
        body.awardTieOrder || [],
        body.awardRuling || "",
      );
      if (!body.impact || !sameAward(impact, body.impact))
        fail(
          "Award impact changed. Reload and prepare the correction again.",
          409,
        );
      const impactId = await insertRevision(
        db,
        user,
        r.categoryId,
        null,
        "award",
        impact,
        existingAward.id,
        `Result correction: ${r.reason}`,
      );
      await publish(
        db,
        user,
        pendingRevision(
          impactId,
          user,
          r.categoryId,
          null,
          "award",
          impact,
          existingAward.id,
          `Result correction: ${r.reason}`,
        ),
        state,
        reviewNote,
      );
    } else if (body.impact)
      fail(
        "The affected award changed. Reload and prepare the correction again.",
        409,
      );
  }
  await publish(db, user, r, state, reviewNote);
}
async function publish(
  db: PoolClient,
  user: User,
  r: Revision,
  state: Snapshot,
  reviewNote: string,
) {
  if (r.kind === "award") {
    const awards = state.revisions
      .filter(
        (revision) =>
          revision.kind === "award" &&
          revision.status === "approved" &&
          revision.categoryId !== r.categoryId,
      )
      .map((revision) => revision.body as AwardBody);
    requireNonnegativeTally(
      overall([...awards, r.body as AwardBody], await tallyAdjustments(db)),
    );
  }
  const current =
    r.kind === "result"
      ? state.schedules.find((s) => s.id === r.scheduleId)?.publishedId
      : publicAward(state, r.categoryId)?.id || null;
  if ((current || null) !== r.baseId)
    fail(
      "The published version changed. Reject and resubmit against the current version.",
      409,
    );
  if (current)
    await db.query("UPDATE revisions SET status='superseded' WHERE id=$1", [
      current,
    ]);
  await db.query(
    "UPDATE revisions SET status='approved',reviewer_id=$2,reviewed_at=now(),review_note=$3 WHERE id=$1",
    [r.id, user.id, reviewNote],
  );
  if (r.kind === "result")
    await db.query(
      "UPDATE schedules SET published_id=$2,data=jsonb_set(data,'{status}','\"completed\"') WHERE id=$1",
      [r.scheduleId, r.id],
    );
  else
    await db.query(
      "INSERT INTO awards(category_id,revision_id) VALUES($1,$2) ON CONFLICT(category_id) DO UPDATE SET revision_id=$2",
      [r.categoryId, r.id],
    );
  await audit(
    db,
    user,
    `${r.kind}.approved`,
    r.id,
    current ? state.revisions.find((x) => x.id === current)?.body : null,
    r.body,
    r.reason || reviewNote,
  );
}
async function execute(
  db: PoolClient,
  user: User,
  state: Snapshot,
  command: Command,
  passwordHash?: string,
): Promise<unknown> {
  switch (command.action) {
    case "tally.correct": {
      requireAdmin(user);
      const awards = state.revisions
        .filter((r) => r.kind === "award" && r.status === "approved")
        .map((r) => r.body as AwardBody);
      const current = overall(awards, await tallyAdjustments(db)).find(
        (row) => row.id === command.collegeId,
      )!;
      const before = totalsOnly(current);
      if (!isDeepStrictEqual(before, command.expectedTotals))
        fail(
          "This college's tally changed after your confirmation. Reload and review the new totals.",
          409,
        );
      if (isDeepStrictEqual(before, command.totals))
        fail("No tally totals changed.");
      const delta = Object.fromEntries(
        TALLY_KEYS.map((key) => [key, command.totals[key] - before[key]]),
      );
      const id = uid();
      await db.query(
        "INSERT INTO tally_adjustments(id,college_id,points_delta,gold_delta,silver_delta,bronze_delta,actor_id,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          id,
          command.collegeId,
          delta.points,
          delta.gold,
          delta.silver,
          delta.bronze,
          user.id,
          command.reason,
        ],
      );
      await audit(
        db,
        user,
        "tally.corrected",
        id,
        { collegeId: command.collegeId, ...before },
        { collegeId: command.collegeId, ...command.totals },
        command.reason,
      );
      return { id, collegeId: command.collegeId, totals: command.totals };
    }
    case "bracket.save":
      requireAdmin(user);
      return saveBracket(db, user, state, command);
    case "schedule.save":
      return saveSchedule(db, state, user, command.schedule);
    case "entry.add": {
      requireAdmin(user);
      requireAccess(user, command.categoryId);
      const c = findCategory(state, command.categoryId);
      if (publicAward(state, c.id))
        fail("Entries are locked after the category award is published.");
      const existing = state.entries.filter(
        (e) => e.categoryId === c.id && e.collegeId === command.collegeId,
      );
      const max =
        c.event === "Athletics" || c.event === "Mr. and Ms. Intrams" ? 2 : 1;
      if (existing.length >= max)
        fail(`This category allows ${max} entry label(s) per college.`);
      const id = uid();
      await db.query(
        "INSERT INTO entries(id,category_id,college_id,label) VALUES($1,$2,$3,$4)",
        [id, c.id, command.collegeId, command.label],
      );
      await audit(db, user, "entry.created", id, null, command);
      return { id };
    }
    case "result.save": {
      requireAdmin(user);
      const s =
        state.schedules.find((s) => s.id === command.scheduleId) ||
        fail("Schedule not found.", 404);
      requireAccess(user, s.categoryId);
      if (s.publishedId !== command.baseId)
        fail("The published result changed. Reload before saving.", 409);
      if (command.baseId && !command.reason.trim())
        fail("A correction needs a reason.");
      const existing = state.revisions.find(
        (r) => r.scheduleId === s.id && ["draft", "pending"].includes(r.status),
      );
      if (
        existing &&
        (existing.status === "pending" || existing.id !== command.replacesId)
      )
        fail(
          "A draft or submission already exists. Reload the current version.",
          409,
        );
      if (!existing && command.replacesId)
        fail("This draft was changed by another user. Reload.", 409);
      if (existing)
        await db.query("UPDATE revisions SET status='superseded' WHERE id=$1", [
          existing.id,
        ]);
      if (
        new Set(command.body.placings.map((p) => p.entryId)).size !==
          command.body.placings.length ||
        command.body.placings.some((p) => !s.entryIds.includes(p.entryId))
      )
        fail("Draft placings must refer to distinct scheduled entries.");
      const submitting = command.submit || command.publish === true;
      const currentAward = publicAward(state, s.categoryId);
      if (
        submitting &&
        currentAward &&
        (currentAward.body as AwardBody).method !== "certified" &&
        state.revisions.some(
          (revision) =>
            revision.categoryId === s.categoryId &&
            revision.kind === "award" &&
            ["draft", "pending"].includes(revision.status),
        )
      )
        fail(
          "Resolve the championship draft or submission before correcting this calculated result.",
          409,
        );
      if (submitting) validateResult(state, s, command.body);
      const body: ResultBody = command.body;
      const id = await insertRevision(
        db,
        user,
        s.categoryId,
        s.id,
        "result",
        body,
        command.baseId,
        command.reason,
        submitting ? "pending" : "draft",
      );
      const award = publicAward(state, s.categoryId);
      const revision = pendingRevision(
        id,
        user,
        s.categoryId,
        s.id,
        "result",
        body,
        command.baseId,
        command.reason,
      );
      if (
        submitting &&
        award &&
        (award.body as AwardBody).method !== "certified"
      ) {
        body.impact = calculateAward(
          hypotheticalResult(state, revision),
          s.categoryId,
          body.awardPlacings || [],
          body.awardTieOrder || [],
          body.awardRuling || "",
        );
        await db.query("UPDATE revisions SET body=$2 WHERE id=$1", [id, body]);
      }
      if (command.publish) {
        if (body.impact) {
          if (
            command.ruleVersion !== undefined &&
            command.ruleVersion !== findCategory(state, s.categoryId).version
          )
            fail(
              "The event rules changed. Reload and preview the correction again.",
              409,
            );
          await checkTallyPreview(db, state, command.expectedTotals);
          await checkTallyPreview(
            db,
            state,
            command.expectedAfterTotals,
            !!command.expectedTotals,
            { categoryId: s.categoryId, body: body.impact },
          );
        }
        await approveRevision(
          db,
          user,
          revision,
          state,
          "Published by administrator",
        );
      }
      return { id };
    }
    case "award.save": {
      requireAdmin(user);
      requireAccess(user, command.categoryId);
      const category = findCategory(state, command.categoryId);
      if (
        (command.publish || command.ruleVersion !== undefined) &&
        command.ruleVersion !== category.version
      )
        fail(
          "The event rules changed. Reload and preview the award again.",
          409,
        );
      const current = publicAward(state, command.categoryId);
      if ((current?.id || null) !== command.baseId)
        fail("The published award changed. Reload before saving.", 409);
      if (current && !command.reason.trim())
        fail("An award correction needs a reason.");
      const existing = state.revisions.find(
        (r) =>
          r.categoryId === command.categoryId &&
          r.kind === "award" &&
          ["draft", "pending"].includes(r.status),
      );
      if (
        existing &&
        (existing.status === "pending" || existing.id !== command.replacesId)
      )
        fail(
          "A draft or submission already exists. Reload the current version.",
          409,
        );
      if (!existing && command.replacesId)
        fail("This award draft changed. Reload.", 409);
      if (
        command.method === "calculated" &&
        state.revisions.some(
          (r) =>
            r.categoryId === command.categoryId &&
            r.kind === "result" &&
            r.status === "pending",
        )
      )
        fail(
          "Publish or reject pending results before calculating this award.",
        );
      const body =
        command.method === "certified"
          ? calculateCertifiedAward(
              state,
              command.categoryId,
              command.placings,
              command.collegePlacings,
              command.ruling,
              command.publish,
            )
          : calculateAward(
              state,
              command.categoryId,
              command.placings,
              command.tieOrder,
              command.ruling,
            );
      body.method = command.method;
      if (!command.publish)
        body.draftInputs = {
          placings: command.placings,
          collegePlacings: command.collegePlacings,
          tieOrder: command.tieOrder,
        };
      if (command.publish) {
        await checkTallyPreview(db, state, command.expectedTotals, true);
        await checkTallyPreview(db, state, command.expectedAfterTotals, true, {
          categoryId: command.categoryId,
          body,
        });
      }
      if (existing)
        await db.query("UPDATE revisions SET status='superseded' WHERE id=$1", [
          existing.id,
        ]);
      const id = await insertRevision(
        db,
        user,
        command.categoryId,
        null,
        "award",
        body,
        command.baseId,
        command.reason,
        command.publish ? "pending" : "draft",
      );
      if (command.publish)
        await approveRevision(
          db,
          user,
          pendingRevision(
            id,
            user,
            command.categoryId,
            null,
            "award",
            body,
            command.baseId,
            command.reason,
          ),
          state,
          "Published by administrator",
        );
      return { id, preview: body };
    }
    case "award.submit": {
      requireAdmin(user);
      requireAccess(user, command.categoryId);
      const current = publicAward(state, command.categoryId);
      if ((current?.id || null) !== command.baseId)
        fail("The published award changed. Reload.", 409);
      if (current && !command.reason.trim())
        fail("An award correction needs a reason.");
      if (
        state.revisions.some(
          (r) =>
            r.categoryId === command.categoryId &&
            (r.status === "pending" ||
              (r.kind === "award" && r.status === "draft")),
        )
      )
        fail(
          "Resolve the championship draft or pending submissions in this category first.",
          409,
        );
      const body = calculateAward(
        state,
        command.categoryId,
        command.placings,
        command.tieOrder,
        command.ruling,
      );
      const id = await insertRevision(
        db,
        user,
        command.categoryId,
        null,
        "award",
        body,
        command.baseId,
        command.reason,
      );
      return { id, preview: body };
    }
    case "review": {
      requireAdmin(user);
      const r =
        state.revisions.find((r) => r.id === command.id) ||
        fail("Submission not found.", 404);
      if (r.status !== "pending")
        fail(
          "This submission has already been reviewed or is still a draft.",
          409,
        );
      if (command.decision === "reject") {
        if (!command.reason.trim())
          fail("Explain why the submission needs revision.");
        await db.query(
          "UPDATE revisions SET status='rejected',review_note=$2,reviewer_id=$3,reviewed_at=now() WHERE id=$1",
          [r.id, command.reason, user.id],
        );
        await audit(
          db,
          user,
          `${r.kind}.rejected`,
          r.id,
          r.body,
          null,
          command.reason,
        );
        return { id: r.id };
      }
      if (r.kind === "award" || (r.body as ResultBody).impact) {
        if (
          command.ruleVersion !== undefined &&
          command.ruleVersion !== findCategory(state, r.categoryId).version
        )
          fail(
            "The event rules changed. Reload and preview the publication again.",
            409,
          );
        await checkTallyPreview(db, state, command.expectedTotals);
        await checkTallyPreview(
          db,
          state,
          command.expectedAfterTotals,
          !!command.expectedTotals,
          {
            categoryId: r.categoryId,
            body:
              r.kind === "award"
                ? (r.body as AwardBody)
                : (r.body as ResultBody).impact!,
          },
        );
      }
      await approveRevision(db, user, r, state, command.reason);
      return { id: r.id };
    }
    case "account.save": {
      requireSuperadmin(user);
      const before = command.id ? await userById(db, command.id) : null;
      if (command.id && !before) fail("Account not found.", 404);
      if (
        before?.id === user.id &&
        (!command.active || command.role !== user.role)
      )
        fail("You cannot disable or demote your own account.");
      if (
        command.assignments.some(
          (id) => !state.categories.some((c) => c.id === id),
        ) ||
        new Set(command.assignments).size !== command.assignments.length
      )
        fail("Invalid event assignments.");
      if (command.role === "public_relations" && command.assignments.length)
        fail("Public Relations accounts cannot have event assignments.");
      if (!before && !passwordHash)
        fail("Enter an initial password of at least 12 characters.");
      const id = before?.id || uid(),
        storedRole = command.role === "public_relations" ? "officer" : command.role,
        accessScope =
          command.role === "public_relations" ? "public_relations" : "standard";
      if (before) {
        await db.query(
          "UPDATE accounts SET name=$2,email=$3,role=$4,access_scope=$5,active=$6 WHERE id=$1",
          [id, command.name, command.email, storedRole, accessScope, command.active],
        );
        if (passwordHash)
          await db.query(
            "UPDATE accounts SET password_hash=$2,must_reset=true WHERE id=$1",
            [id, passwordHash],
          );
      } else
        await db.query(
          "INSERT INTO accounts(id,name,email,role,access_scope,active,password_hash,must_reset) VALUES($1,$2,$3,$4,$5,$6,$7,true)",
          [
            id,
            command.name,
            command.email,
            storedRole,
            accessScope,
            command.active,
            passwordHash,
          ],
        );
      if (
        before &&
        (passwordHash || !command.active || before.role !== command.role)
      )
        await db.query("DELETE FROM sessions WHERE account_id=$1", [id]);
      await db.query("DELETE FROM assignments WHERE account_id=$1", [id]);
      for (const categoryId of
        command.role === "public_relations" ? [] : command.assignments)
        await db.query(
          "INSERT INTO assignments(account_id,category_id) VALUES($1,$2)",
          [id, categoryId],
        );
      const after = await userById(db, id);
      await audit(
        db,
        user,
        "account.updated",
        id,
        before,
        after,
        passwordHash ? "Password reset; sessions revoked." : "",
      );
      return { id };
    }
    case "discipline.create": {
      requireSuperadmin(user);
      const category = findCategory(state, command.categoryId);
      if (category.aggregation !== "subpoints")
        fail("Disciplines can only be added to aggregate event categories.");
      if (publicAward(state, category.id))
        fail("The category is finalized. New disciplines are locked.");
      const disciplineId = `${category.id}-${slug(command.name)}`;
      if (disciplineId === `${category.id}-`)
        fail("Enter a discipline name containing letters or numbers.");
      if (
        state.disciplines.some(
          (discipline) =>
            discipline.id === disciplineId ||
            (discipline.categoryId === category.id &&
              discipline.name.localeCompare(command.name, undefined, {
                sensitivity: "base",
              }) === 0),
        )
      )
        fail("This discipline already exists.", 409);
      const discipline = {
        id: disciplineId,
        categoryId: category.id,
        name: command.name,
        rule: command.rule,
        scheduleMode: command.scheduleMode,
        active: false,
        reason: command.reason,
        version: 1,
      };
      await db.query(
        "INSERT INTO disciplines(id,category_id,data,version) VALUES($1,$2,$3,1)",
        [discipline.id, discipline.categoryId, discipline],
      );
      await audit(
        db,
        user,
        "discipline.created",
        discipline.id,
        null,
        discipline,
        command.reason,
      );
      return { id: discipline.id };
    }
    case "category.configure": {
      requireAdmin(user);
      const c = findCategory(state, command.id);
      if (c.version !== command.version)
        fail("This rule changed. Reload.", 409);
      if (c.event !== "Mr. and Ms. Intrams" && command.policy !== "college")
        fail("This category awards once per college.");
      if (
        c.event === "Mr. and Ms. Intrams" &&
        command.confirmed &&
        command.policy === "college"
      )
        fail(
          "Confirm per-candidate or best-candidate aggregation before enabling pageant points.",
        );
      const updated = {
        ...c,
        rule: command.rule,
        policy: command.policy,
        confirmed: command.confirmed,
        hold: command.confirmed ? "" : "Await official scoring confirmation.",
        version: c.version + 1,
        source: command.reason,
      };
      await db.query(
        "UPDATE categories SET data=$2,version=version+1 WHERE id=$1",
        [c.id, updated],
      );
      await audit(db, user, "rule.updated", c.id, c, updated, command.reason);
      return { id: c.id };
    }
    case "discipline.configure": {
      requireAdmin(user);
      const d =
        state.disciplines.find((d) => d.id === command.id) ||
        fail("Discipline not found.", 404);
      if (d.version !== command.version)
        fail("This discipline changed. Reload.", 409);
      if (publicAward(state, d.categoryId))
        fail("The category is finalized. Discipline inclusion is locked.");
      if (
        !command.active &&
        state.schedules.some(
          (s) => s.disciplineId === d.id && s.status !== "cancelled",
        )
      )
        fail(
          "Cancel scheduled competitions with an official reason before disabling a discipline.",
        );
      const updated = {
        ...d,
        active: command.active,
        reason: command.reason,
        version: d.version + 1,
      };
      await db.query(
        "UPDATE disciplines SET data=$2,version=version+1 WHERE id=$1",
        [d.id, updated],
      );
      await audit(
        db,
        user,
        "discipline.updated",
        d.id,
        d,
        updated,
        command.reason,
      );
      return { id: d.id };
    }
    case "result.delete": {
      requireSuperadmin(user);
      const schedule =
        state.schedules.find((item) => item.id === command.scheduleId) ||
        fail("Schedule not found.", 404);
      if (
        schedule.version !== command.version ||
        schedule.publishedId !== command.publishedId
      )
        fail("This schedule or result changed. Reload before deleting.", 409);
      const resultRevisions = state.revisions.filter(
        (revision) =>
          revision.kind === "result" && revision.scheduleId === schedule.id,
      );
      const activeRevisions = resultRevisions.filter((revision) =>
        ["draft", "pending", "approved"].includes(revision.status),
      );
      if (!activeRevisions.length)
        fail("There is no current result to delete.", 409);
      const dependentAward = state.revisions.find(
        (revision) =>
          revision.categoryId === schedule.categoryId &&
          revision.kind === "award" &&
          ["draft", "pending", "approved"].includes(revision.status) &&
          (revision.body as AwardBody).method !== "certified",
      );
      if (dependentAward)
        fail(
          "A calculated championship depends on this result. Replace or remove that championship first.",
          409,
        );
      await db.query(
        "UPDATE revisions SET status='superseded' WHERE schedule_id=$1 AND kind='result' AND status IN ('draft','pending','approved')",
        [schedule.id],
      );
      const updated = {
        ...schedule,
        publishedId: null,
        version: schedule.version + 1,
        scoringVersion: (schedule.scoringVersion ?? schedule.version) + 1,
      };
      await db.query(
        "UPDATE schedules SET published_id=NULL,data=$2,version=version+1 WHERE id=$1",
        [schedule.id, updated],
      );
      await audit(
        db,
        user,
        "result.deleted",
        schedule.id,
        { schedule, revisions: activeRevisions },
        { schedule: updated, revisions: [] },
        command.reason,
      );
      return { id: schedule.id };
    }
    case "schedule.delete": {
      requireSuperadmin(user);
      const schedule =
        state.schedules.find((item) => item.id === command.id) ||
        fail("Schedule not found.", 404);
      if (schedule.version !== command.version)
        fail("This schedule changed. Reload before deleting.", 409);
      if (state.revisions.some((revision) => revision.scheduleId === schedule.id))
        fail(
          "Schedules with result history cannot be permanently deleted. Cancel the schedule instead.",
          409,
        );
      if (state.schedules.some((item) => item.followsId === schedule.id))
        fail(
          "Another competition follows this schedule. Update that competition first.",
          409,
        );
      const linkedBracket = (await bracketRecords(db)).some((record) =>
        [record.draft, record.published].some((graph) =>
          graph?.nodes.some((node) => node.fixtureId === schedule.id),
        ),
      );
      if (linkedBracket)
        fail(
          "This schedule is linked to a tournament bracket. Remove the bracket link first.",
          409,
        );
      await db.query("DELETE FROM schedules WHERE id=$1", [schedule.id]);
      await audit(
        db,
        user,
        "schedule.deleted",
        schedule.id,
        schedule,
        null,
        command.reason,
      );
      return { id: schedule.id };
    }
  }
}
export function commandChangesPublicData(command: Command) {
  switch (command.action) {
    case "tally.correct":
    case "schedule.save":
    case "entry.add":
    case "discipline.create":
    case "category.configure":
    case "discipline.configure":
    case "result.delete":
    case "schedule.delete":
      return true;
    case "bracket.save":
      // Republishing also changes its public publication timestamp.
      return command.publish;
    case "result.save":
    case "award.save":
      return command.publish === true;
    case "review":
      return command.decision === "approve";
    default:
      return false;
  }
}
export async function command(user: User, input: unknown, key: string) {
  const c = commandSchema.parse(input);
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(key))
    fail(
      "Provide an Idempotency-Key with 8–100 letters, digits, underscores or hyphens.",
    );
  const requestHash = hash(JSON.stringify(c));
  const passwordHash =
    c.action === "account.save" && c.password
      ? await bcrypt.hash(c.password, 12)
      : undefined;
  return transaction(
    async (db) => {
      const fresh = await userById(db, user.id);
      if (!fresh?.active) fail("Account is disabled.", 401);
      if (fresh!.mustReset)
        fail("Change your temporary password before continuing.", 403);
      if (fresh!.role === "public_relations")
        fail("Public Relations accounts have read-only access.", 403);
      const prior = (
        await db.query(
          "SELECT * FROM idempotency WHERE actor_id=$1 AND key=$2",
          [user.id, key],
        )
      ).rows[0];
      if (prior) {
        if (prior.request_hash !== requestHash)
          fail(
            "This request key was already used for a different action.",
            409,
          );
        return prior.response;
      }
      const state = await snapshot(db);
      const result = await execute(db, fresh!, state, c, passwordHash);
      await db.query(
        "INSERT INTO idempotency(actor_id,key,request_hash,response) VALUES($1,$2,$3,$4)",
        [user.id, key, requestHash, JSON.stringify(result)],
      );
      return result;
    },
    true,
    commandChangesPublicData(c),
  );
}
export async function staffState(user: User) {
  return transaction(async (db) => {
    const fresh = await userById(db, user.id);
    if (!fresh?.active) fail("Account is disabled.", 401);
    if (fresh!.mustReset) return { user: fresh, resetRequired: true };
    const s = await snapshot(db),
      visible = (id: string) => canAccess(fresh!, id);
    if (fresh!.role === "public_relations") {
      const publishedResultIds = new Set(
        s.schedules.flatMap((schedule) =>
          schedule.publishedId ? [schedule.publishedId] : [],
        ),
      );
      const revisions = s.revisions
        .filter(
          (revision) =>
            revision.status === "approved" &&
            ((revision.kind === "result" &&
              publishedResultIds.has(revision.id)) ||
              revision.kind === "award"),
        )
        .map((revision) => ({
          ...revision,
          actorId: "",
          reviewerId: null,
          reason: "",
          reviewNote: "",
          body:
            revision.kind === "result"
              ? {
                  scoreA: (revision.body as ResultBody).scoreA,
                  scoreB: (revision.body as ResultBody).scoreB,
                  outcome: (revision.body as ResultBody).outcome,
                  ...((revision.body as ResultBody).decision
                    ? { decision: (revision.body as ResultBody).decision }
                    : {}),
                  placings: (revision.body as ResultBody).placings,
                  note: (revision.body as ResultBody).note,
                  ruling: "",
                }
              : {
                  rows: (revision.body as AwardBody).rows,
                  source: "",
                  ruleVersion: (revision.body as AwardBody).ruleVersion,
                  ruling: "",
                  ...((revision.body as AwardBody).method
                    ? { method: (revision.body as AwardBody).method }
                    : {}),
                },
        })) as Revision[];
      return {
        ...s,
        mode: "public_relations" as const,
        user: fresh,
        users: [],
        audit: [],
        revisionActors: [],
        brackets: [],
        tallyAdjustments: await tallyAdjustments(db),
        categories: s.categories.map((category) => ({
          ...category,
          source: "",
        })),
        disciplines: s.disciplines.map((discipline) => ({
          ...discipline,
          reason: "",
        })),
        schedules: s.schedules.map((schedule) => ({
          ...schedule,
          reason: "",
        })),
        revisions,
      };
    }
    const users: User[] = [];
    if (fresh!.role === "superadmin")
      for (const row of (
        await db.query("SELECT id FROM accounts ORDER BY name")
      ).rows)
        users.push((await userById(db, row.id))!);
    const trail =
      fresh!.role === "superadmin"
        ? (
            await db.query(
              'SELECT id,actor_id AS "actorId",action,entity_id AS "entityId",before_data AS before,after_data AS after,reason,created_at AS "createdAt" FROM audit ORDER BY created_at DESC LIMIT 200',
            )
          ).rows
        : [];
    const revisions = s.revisions.filter((r) => visible(r.categoryId));
    const actorIds = [
      ...new Set(
        revisions.flatMap((r) => [r.actorId, r.reviewerId]).filter(Boolean),
      ),
    ];
    const revisionActors = actorIds.length
      ? ((
          await db.query(
            "SELECT id,name FROM accounts WHERE id=ANY($1::text[]) ORDER BY name,id",
            [actorIds],
          )
        ).rows as Array<{ id: string; name: string }>)
      : [];
    return {
      ...s,
      mode: "staff" as const,
      brackets: (await bracketRecords(db)).filter((b) =>
        visible(b.draft.categoryId),
      ),
      user: fresh,
      users,
      revisionActors,
      tallyAdjustments: await tallyAdjustments(db),
      categories: s.categories.filter((c) => visible(c.id)),
      disciplines: s.disciplines.filter((d) => visible(d.categoryId)),
      entries: s.entries.filter((e) => visible(e.categoryId)),
      schedules: s.schedules.filter((x) => visible(x.categoryId)),
      revisions,
      audit: trail,
    };
  });
}
