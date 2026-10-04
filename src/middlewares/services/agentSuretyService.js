/**
 * Sureties collected by collection agents in the field (optional, per ticket).
 *
 * An agent may only see and change sureties on tickets where they are the collection agent.
 * Sureties the office added (Surety Entry) are shown read-only, except that the agent can still
 * tick off their documents. Agent-added sureties can be edited or removed until the office has
 * verified one of their documents. Everything is stored in the existing `sureties` table, so the
 * office's Surety Entry screen and Surety List report show agent-added sureties too.
 */
const { Op } = require('sequelize');
const { Surety, Enrollment, Member, EnrollmentJointHolder, MemberDocument, NotificationHistory, sequelize } = require('../models');
const { DOCUMENT_KEYS, DOC_STATUS, checklist, checklistSummary } = require('../utils/documentChecklist');

const MAX_SURETIES_PER_TICKET = 2;
const RELATIONS = ['Father', 'Mother', 'Spouse', 'Brother', 'Sister', 'Son', 'Daughter', 'Friend', 'Colleague', 'Other'];

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const digits = (v) => String(v || '').replace(/\D/g, '');

/** The calling agent, with their company. */
const agentOf = async (userPayload) => {
  const agent = userPayload && userPayload.id ? await Member.findByPk(userPayload.id, { attributes: ['id', 'company_id', 'name'] }) : null;
  if (!agent) throw new HttpError(401, 'Unauthorized access');
  return agent;
};

/** A ticket the agent collects for, or 404. */
const agentTicket = async (agent, enrollmentId) => {
  const enrollment = await Enrollment.findOne({
    where: { id: enrollmentId, company_id: agent.company_id, collection_agent_id: agent.id, delete_status: 0 },
  });
  if (!enrollment) throw new HttpError(404, 'Ticket not found in your collections');
  return enrollment;
};

/** A live surety on a ticket the agent collects for, or 404. */
const agentSurety = async (agent, suretyId) => {
  const surety = await Surety.findOne({ where: { id: suretyId, company_id: agent.company_id, is_deleted_status: 0 } });
  if (!surety) throw new HttpError(404, 'Surety not found');
  await agentTicket(agent, surety.enrollment_id);
  return surety;
};

const hasVerifiedDocument = (surety) => checklist(surety.documents).some((d) => d.status === DOC_STATUS.VERIFIED);

const suretyView = (s, agentId) => {
  const items = checklist(s.documents);
  const locked = hasVerifiedDocument(s);
  return {
    id: s.id,
    enrollment_id: s.enrollment_id,
    name: s.name,
    mobile_number: s.mobile_number,
    alternate_mobile_number: s.alternate_mobile_number || null,
    relation: s.relation || null,
    address: s.address || null,
    source: s.source || 'office',
    added_by_you: s.source === 'agent' && Number(s.added_by) === Number(agentId),
    // The agent edits only what agents added, and only until the office verifies a document.
    can_edit: s.source === 'agent' && !locked,
    documents: items,
    ...checklistSummary(items),
    created_at: s.createdAt,
  };
};

/** Mobile numbers of everyone holding the ticket (main + active joint holders). */
const holderMobiles = async (enrollment) => {
  const joint = await EnrollmentJointHolder.findAll({ where: { enrollment_id: enrollment.id, removed_on: null }, attributes: ['member_id'] });
  const ids = [enrollment.subscriber_id, ...joint.map((j) => j.member_id)];
  const members = await Member.findAll({ where: { id: { [Op.in]: ids } }, attributes: ['mobile_number'] });
  return new Set(members.map((m) => digits(m.mobile_number)).filter(Boolean));
};

// ------------------------------------------------------------------ list

/** The member's tickets in the group (as main or joint holder) that the agent collects for. */
const memberTickets = async (agent, group_id, member_id) => {
  const jointIds = (await EnrollmentJointHolder.findAll({
    where: { member_id, removed_on: null }, attributes: ['enrollment_id'],
  })).map((j) => j.enrollment_id);
  return Enrollment.findAll({
    where: {
      group_id,
      company_id: agent.company_id,
      collection_agent_id: agent.id,
      delete_status: 0,
      [Op.or]: [{ subscriber_id: member_id }, ...(jointIds.length ? [{ id: { [Op.in]: jointIds } }] : [])],
    },
    order: [['group_position_number', 'ASC']],
  });
};

/** Every ticket this member holds in the group that the agent collects for, with its sureties. */
async function listForMember(userPayload, { group_id, member_id }) {
  const agent = await agentOf(userPayload);
  const tickets = await memberTickets(agent, group_id, member_id);
  if (!tickets.length) throw new HttpError(404, 'Member not found in your collections for this group');

  const sureties = await Surety.findAll({
    where: { enrollment_id: { [Op.in]: tickets.map((t) => t.id) }, company_id: agent.company_id, is_deleted_status: 0 },
    order: [['createdAt', 'ASC']],
  });

  return {
    max_sureties_per_ticket: MAX_SURETIES_PER_TICKET,
    relations: RELATIONS,
    tickets: tickets.map((t) => {
      const rows = sureties.filter((s) => s.enrollment_id === t.id).map((s) => suretyView(s, agent.id));
      return {
        enrollment_id: t.id,
        ticket_number: t.group_position_number,
        can_add: rows.length < MAX_SURETIES_PER_TICKET,
        sureties: rows,
      };
    }),
  };
}

// ----------------------------------------------------------- one save

const MEMBER_DOC_STATUSES = [DOC_STATUS.NOT_SUBMITTED, DOC_STATUS.SUBMITTED];

/** Surety details as sent, in stored form (not yet validated). */
const readDetails = (e) => ({
  name: String(e.name || '').trim(),
  mobile_number: digits(e.mobile_number),
  alternate_mobile_number: digits(e.alternate_mobile_number) || null,
  relation: String(e.relation || '').trim(),
  address: String(e.address || '').trim() || null,
});

/** Validate details that are being saved (new, or changed). */
const checkDetails = (v, fail) => {
  if (!v.name) fail(400, "Enter the surety's name");
  if (v.mobile_number.length !== 10) fail(400, 'Enter a valid 10-digit mobile number');
  if (v.alternate_mobile_number && v.alternate_mobile_number.length !== 10) fail(400, 'Enter a valid 10-digit alternate mobile number');
  if (v.alternate_mobile_number && v.alternate_mobile_number === v.mobile_number) fail(400, 'The alternate mobile is the same as the mobile number');
  if (!v.relation) fail(400, 'Choose how the surety is related to the member');
};

// Stored rows may be office-entered (spaces in numbers, blank relation), so compare in the same normal form.
const DETAIL_FIELDS = ['name', 'mobile_number', 'alternate_mobile_number', 'relation', 'address'];
const detailsChanged = (surety, values) => {
  const stored = readDetails(surety);
  return DETAIL_FIELDS.some((f) => String(stored[f] ?? '') !== String(values[f] ?? ''));
};

/** Apply ticks (0 / 1) to a stored surety checklist; verified documents are never changed here. */
const applyTicks = (stored, ticks, who) => {
  const next = { ...(stored || {}) };
  let changed = false;
  for (const t of ticks || []) {
    const cur = next[t.document_type] || {};
    const curStatus = Number.isInteger(cur.status) ? cur.status : DOC_STATUS.NOT_SUBMITTED;
    const want = Number(t.status);
    if (curStatus === DOC_STATUS.VERIFIED) continue; // only the office changes a verified document
    if (![DOC_STATUS.NOT_SUBMITTED, DOC_STATUS.SUBMITTED].includes(want)) continue; // 2 / 3 sent back as shown: no change
    if (want === curStatus) continue;
    next[t.document_type] = { status: want, rejection_reason: null, updated_at: new Date().toISOString(), updated_by: who };
    changed = true;
  }
  return { next, changed };
};

/**
 * The Documents screen's single Save: the member's document ticks and the member's sureties
 * (add, edit, remove, and each surety's document ticks) in one call, all or nothing.
 *
 *   documents: [{ document_type, status }]              member ticks: 1 submitted, 0 not submitted
 *   sureties:  [{ id?, enrollment_id?, remove?, name, mobile_number, alternate_mobile_number?,
 *                 relation, address?, documents?: [{ document_type, status }] }]
 *
 * Everything is checked before anything is written, and only what changed is written.
 */
async function saveAll(userPayload, { group_id, member_id, documents = [], sureties = [] }) {
  const agent = await agentOf(userPayload);
  const tickets = await memberTickets(agent, group_id, member_id);
  if (!tickets.length) throw new HttpError(404, 'Member not found in your collections for this group');

  // ---- member documents
  for (const d of documents) {
    if (!DOCUMENT_KEYS.includes(d.document_type)) throw new HttpError(400, `Unknown document type: ${d.document_type}`);
    if (!MEMBER_DOC_STATUSES.includes(Number(d.status))) throw new HttpError(400, 'Document status must be 1 (submitted) or 0 (not submitted)');
  }

  // ---- sureties: check everything and build a plan
  const existing = await Surety.findAll({
    where: { enrollment_id: { [Op.in]: tickets.map((t) => t.id) }, company_id: agent.company_id, is_deleted_status: 0 },
  });
  const byId = new Map(existing.map((x) => [x.id, x]));
  const plan = [];
  const holders = {};
  for (const [i, e] of sureties.entries()) {
    const label = sureties.length > 1 ? `Surety ${i + 1}: ` : '';
    const fail = (status, msg) => { throw new HttpError(status, label + msg); };

    let surety = null;
    let ticket;
    if (e.id) {
      surety = byId.get(Number(e.id));
      if (!surety) fail(404, 'Surety not found');
      ticket = tickets.find((t) => t.id === surety.enrollment_id);
    } else {
      if (e.remove) continue; // a surety added and removed on screen before saving: nothing to do
      ticket = e.enrollment_id
        ? tickets.find((t) => t.id === Number(e.enrollment_id))
        : (tickets.length === 1 ? tickets[0] : null);
      if (!ticket) {
        if (e.enrollment_id) fail(404, 'Ticket not found in your collections');
        fail(400, 'This member has more than one ticket in this group; send enrollment_id to choose the ticket');
      }
    }
    for (const d of e.documents || []) {
      if (!DOCUMENT_KEYS.includes(d.document_type)) fail(400, `Unknown document type: ${d.document_type}`);
    }

    if (e.remove) {
      if (surety.source !== 'agent') fail(403, 'Only the office can remove this surety');
      if (hasVerifiedDocument(surety)) fail(400, "The office has already verified this surety's documents; ask the office to remove it");
      plan.push({ kind: 'remove', surety, ticket });
      continue;
    }

    const values = readDetails(e);
    const changed = !surety || detailsChanged(surety, values);
    if (surety && changed) {
      if (surety.source !== 'agent') fail(403, 'Only the office can change this surety');
      if (hasVerifiedDocument(surety)) fail(400, "The office has already verified this surety's documents; ask the office to change it");
    }
    if (changed) {
      // Unchanged details are not re-checked: ticking documents on an office-entered surety must still work.
      checkDetails(values, fail);
      holders[ticket.id] = holders[ticket.id] || await holderMobiles(ticket);
      if (holders[ticket.id].has(values.mobile_number)) fail(400, "The surety can't be the member (or a holder of this ticket)");
    }
    plan.push({ kind: surety ? 'update' : 'create', surety, ticket, values, changed, documents: e.documents || [] });
  }

  // ---- the result per ticket: at most 2 sureties, no person twice
  for (const t of tickets) {
    const mobiles = [];
    for (const x of existing.filter((y) => y.enrollment_id === t.id)) {
      const p = plan.find((q) => q.surety && q.surety.id === x.id);
      if (p && p.kind === 'remove') continue;
      mobiles.push(p ? p.values.mobile_number : digits(x.mobile_number));
    }
    plan.filter((p) => p.kind === 'create' && p.ticket.id === t.id).forEach((p) => mobiles.push(p.values.mobile_number));
    if (mobiles.length > MAX_SURETIES_PER_TICKET) throw new HttpError(400, `A ticket can have at most ${MAX_SURETIES_PER_TICKET} sureties`);
    if (new Set(mobiles).size !== mobiles.length) throw new HttpError(400, 'This person is already a surety on this ticket');
  }

  // ---- write, all or nothing
  const who = `agent:${agent.id}`;
  const changedMemberDocs = [];
  await sequelize.transaction(async (transaction) => {
    if (documents.length) {
      let rec = await MemberDocument.findOne({ where: { group_id, member_id }, transaction });
      const stored = rec && rec.documents ? { ...rec.documents } : {};
      for (const d of documents) {
        const cur = stored[d.document_type] || {};
        const want = Number(d.status);
        const curStatus = cur.status !== undefined && cur.status !== null ? Number(cur.status) : 0;
        if (curStatus === want) continue;
        stored[d.document_type] = { ...cur, url: cur.url ?? null, status: want, uploaded_at: new Date().toISOString() };
        changedMemberDocs.push(d.document_type);
      }
      if (changedMemberDocs.length) {
        if (!rec) {
          await MemberDocument.create({ group_id, member_id, documents: stored, uploaded_by: agent.id, status: 1 }, { transaction });
        } else {
          rec.set('documents', stored);
          rec.changed('documents', true);
          rec.uploaded_by = agent.id;
          rec.status = 1;
          await rec.save({ transaction });
        }
      }
    }

    for (const p of plan) {
      if (p.kind === 'remove') {
        await p.surety.update({ is_deleted_status: 1 }, { transaction }); // soft delete: guarantor history is evidence
        continue;
      }
      let row = p.surety;
      if (p.kind === 'create') {
        row = await Surety.create({
          ...p.values, company_id: agent.company_id, enrollment_id: p.ticket.id, source: 'agent', added_by: agent.id, documents: {},
        }, { transaction });
      } else if (p.changed) {
        await row.update(p.values, { transaction });
      }
      const ticks = applyTicks(row.documents, p.documents, who);
      if (ticks.changed) {
        row.set('documents', ticks.next);
        row.changed('documents', true);
        await row.save({ transaction });
      }
    }
  });

  // One note to the office when member documents changed (the single-document upload sends one per document).
  if (changedMemberDocs.length) {
    try {
      const member = await Member.findByPk(member_id, { attributes: ['id', 'name', 'company_id'] });
      if (member && member.company_id) {
        await NotificationHistory.create({
          user_id: String(member.company_id),
          user_type: 'STAFF',
          company_id: member.company_id,
          title: 'Member Documents Updated',
          body: `${agent.name || 'Collection agent'} updated ${changedMemberDocs.length} document(s) for member ${member.name || 'Member'}.`,
          data_payload: { type: 'DOCUMENT_UPLOADED', member_id: String(member_id), group_id: String(group_id), document_types: changedMemberDocs },
          is_read: false,
        });
      }
    } catch (err) {
      console.error('[NOTIF] Failed to save documents-updated notification:', err.message);
    }
  }

  const { memberDocumentsView } = require('./userService');
  return {
    documents: await memberDocumentsView(group_id, member_id),
    sureties: await listForMember(userPayload, { group_id, member_id }),
  };
}

/** The sureties block for the documents list API; empty when the member isn't in the agent's collections. */
async function suretiesBlock(userPayload, { group_id, member_id }) {
  try {
    return await listForMember(userPayload, { group_id, member_id });
  } catch (err) {
    if (err instanceof HttpError) return { max_sureties_per_ticket: MAX_SURETIES_PER_TICKET, relations: RELATIONS, tickets: [] };
    throw err;
  }
}

module.exports = {
  listForMember, saveAll, suretiesBlock,
  HttpError, MAX_SURETIES_PER_TICKET, RELATIONS,
};
