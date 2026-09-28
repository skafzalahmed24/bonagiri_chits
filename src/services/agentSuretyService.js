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
const { Surety, Enrollment, Member, EnrollmentJointHolder } = require('../models');
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

/** Every ticket this member holds in the group (as main or joint holder) that the agent collects for. */
async function listForMember(userPayload, { group_id, member_id }) {
  const agent = await agentOf(userPayload);
  const jointIds = (await EnrollmentJointHolder.findAll({
    where: { member_id, removed_on: null }, attributes: ['enrollment_id'],
  })).map((j) => j.enrollment_id);

  const tickets = await Enrollment.findAll({
    where: {
      group_id,
      company_id: agent.company_id,
      collection_agent_id: agent.id,
      delete_status: 0,
      [Op.or]: [{ subscriber_id: member_id }, ...(jointIds.length ? [{ id: { [Op.in]: jointIds } }] : [])],
    },
    attributes: ['id', 'group_position_number'],
    order: [['group_position_number', 'ASC']],
  });
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

// ------------------------------------------------------------------ save

async function saveSurety(userPayload, body) {
  const agent = await agentOf(userPayload);
  const enrollment = await agentTicket(agent, body.enrollment_id);

  const name = String(body.name || '').trim();
  const mobile = digits(body.mobile_number);
  const altMobile = digits(body.alternate_mobile_number);
  const relation = String(body.relation || '').trim();
  const address = String(body.address || '').trim();
  if (!name) throw new HttpError(400, "Enter the surety's name");
  if (mobile.length !== 10) throw new HttpError(400, 'Enter a valid 10-digit mobile number');
  if (altMobile && altMobile.length !== 10) throw new HttpError(400, 'Enter a valid 10-digit alternate mobile number');
  if (altMobile && altMobile === mobile) throw new HttpError(400, 'The alternate mobile is the same as the mobile number');
  if (!relation) throw new HttpError(400, 'Choose how the surety is related to the member');

  if ((await holderMobiles(enrollment)).has(mobile)) {
    throw new HttpError(400, "The surety can't be the member (or a holder of this ticket)");
  }

  let surety = null;
  if (body.id) {
    surety = await agentSurety(agent, body.id);
    if (surety.enrollment_id !== enrollment.id) throw new HttpError(404, 'Surety not found');
    if (surety.source !== 'agent') throw new HttpError(403, 'Only the office can change this surety');
    if (hasVerifiedDocument(surety)) throw new HttpError(400, "The office has already verified this surety's documents; ask the office to change it");
  }

  const others = await Surety.findAll({
    where: { enrollment_id: enrollment.id, is_deleted_status: 0, ...(surety ? { id: { [Op.ne]: surety.id } } : {}) },
    attributes: ['id', 'mobile_number'],
  });
  if (others.some((o) => digits(o.mobile_number) === mobile)) throw new HttpError(400, 'This person is already a surety on this ticket');
  if (!surety && others.length >= MAX_SURETIES_PER_TICKET) {
    throw new HttpError(400, `A ticket can have at most ${MAX_SURETIES_PER_TICKET} sureties`);
  }

  const values = { name, mobile_number: mobile, alternate_mobile_number: altMobile || null, relation, address: address || null };
  if (surety) {
    await surety.update(values);
  } else {
    surety = await Surety.create({
      ...values,
      company_id: agent.company_id,
      enrollment_id: enrollment.id,
      source: 'agent',
      added_by: agent.id,
      documents: {},
    });
  }
  return suretyView(await Surety.findByPk(surety.id), agent.id);
}

// ------------------------------------------------------------ documents

/** Tick (submitted) or untick one document. A verified document can't be changed by the agent. */
async function setDocument(userPayload, { surety_id, document_type, submitted }) {
  const agent = await agentOf(userPayload);
  if (!DOCUMENT_KEYS.includes(document_type)) throw new HttpError(400, 'Unknown document type');
  const surety = await agentSurety(agent, surety_id);

  const documents = { ...(surety.documents || {}) };
  const current = documents[document_type] || {};
  if (current.status === DOC_STATUS.VERIFIED) throw new HttpError(400, 'The office has already verified this document');

  documents[document_type] = {
    status: submitted ? DOC_STATUS.SUBMITTED : DOC_STATUS.NOT_SUBMITTED,
    rejection_reason: null, // a resubmission clears the old rejection
    updated_at: new Date().toISOString(),
    updated_by: `agent:${agent.id}`,
  };
  surety.set('documents', documents);
  surety.changed('documents', true);
  await surety.save();
  return suretyView(surety, agent.id);
}

// --------------------------------------------------------------- remove

async function removeSurety(userPayload, { surety_id }) {
  const agent = await agentOf(userPayload);
  const surety = await agentSurety(agent, surety_id);
  if (surety.source !== 'agent') throw new HttpError(403, 'Only the office can remove this surety');
  if (hasVerifiedDocument(surety)) throw new HttpError(400, "The office has already verified this surety's documents; ask the office to remove it");
  await surety.update({ is_deleted_status: 1 }); // soft delete: guarantor history is evidence
  return { id: surety.id };
}

module.exports = {
  listForMember, saveSurety, setDocument, removeSurety,
  HttpError, MAX_SURETIES_PER_TICKET, RELATIONS,
};
