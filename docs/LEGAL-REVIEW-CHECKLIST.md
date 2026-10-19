# Legal Review Checklist

⚠ **This document lists items that MUST be reviewed by a UAE-qualified legal adviser before production use.**

The Trustee Operations Portal system provides **tooling** — not legal advice. All compliance content is a **template** that requires sign-off from a qualified legal adviser.

---

## 1. Privacy Policy

**Location:** Configuration → Privacy Policy → current published version

**Items to review:**
- [ ] Overall policy language is accurate and complete
- [ ] Data categories listed match actual data collected by the system
- [ ] Purposes of processing are accurate and not over-broad
- [ ] Legal bases cited (consent, contract, legal obligation) are valid under PDPL
- [ ] Retention periods stated match the configured retention rules
- [ ] Data subject rights section is complete (access, rectification, erasure, portability, objection, restriction, withdrawal)
- [ ] DPO contact details are accurate
- [ ] Cross-border transfer statement is accurate (currently "no transfers" — update if this changes)
- [ ] Changes-to-policy clause is reasonable
- [ ] Arabic translation (if provided) matches the English version

**Sign-off required from:** UAE-qualified legal adviser

---

## 2. Consent Wording

**Location:** Client onboarding wizard → consent capture form

**Items to review:**
- [ ] Consent text is clear and unambiguous
- [ ] Consent is freely given (not bundled with other terms)
- [ ] Consent is specific (per-purpose, not blanket)
- [ ] Consent is informed (the data subject understands what they're consenting to)
- [ ] Consent withdrawal process is easy and documented
- [ ] Marketing consent is separate from service consent
- [ ] Communications consent is separate from marketing consent
- [ ] Consent version is tracked (re-consent required when policy materially changes)

**Sign-off required from:** UAE-qualified legal adviser

---

## 3. Retention Periods

**Location:** Configuration → Retention Rules

**Default template periods (require review):**
| Category | Default Period | Action | Notes |
|---|---|---|---|
| Case | 7 years after closure | ARCHIVE | Requires review — may vary by case type |
| Document | 7 years after case closure | ARCHIVE | Requires review — DLD may require longer |
| Communication | 3 years | DELETE | Requires review |
| AI Extraction | 2 years (raw OCR 90 days) | DELETE | Requires review |
| Audit Log | 10 years | ARCHIVE | Never deleted under legal hold |
| Notification | 1 year | DELETE | Requires review |

**Items to review:**
- [ ] Case retention period aligns with DLD requirements
- [ ] Document retention period aligns with DLD requirements
- [ ] Communication retention period is appropriate
- [ ] AI extraction retention period is appropriate (OCR text cache)
- [ ] Audit log retention period meets legal requirements
- [ ] Notification retention period is appropriate
- [ ] Legal hold procedure is documented and communicated to all staff

**Sign-off required from:** UAE-qualified legal adviser

---

## 4. Data Subject Request (DSR) Templates

**Location:** Configuration → Data Subject Requests → fulfillment actions

**Items to review:**
- [ ] Access bundle content is appropriate (client-visible data only, no internal notes)
- [ ] Erasure procedure respects legal retention obligations
- [ ] Rectification procedure is documented
- [ ] Portability format (JSON) is acceptable
- [ ] Objection/restriction handling is documented
- [ ] 30-day SLA is sufficient (PDPL default)
- [ ] 20-day reminder + 25-day escalation thresholds are appropriate
- [ ] DSR rejection criteria (legal hold, active cases) are appropriate

**Sign-off required from:** UAE-qualified legal adviser

---

## 5. Cross-Border Transfer Log

**Location:** Configuration → Cross-Border Transfers

**Items to review:**
- [ ] Log captures all required fields (data category, destination, legal basis, purpose)
- [ ] Legal basis options align with PDPL Article 14 (adequacy decision, SCCs, BCRs, explicit consent)
- [ ] Procedure for recording future transfers is documented
- [ ] DPO is notified when new transfers are logged

**Sign-off required from:** UAE-qualified legal adviser

---

## 6. Data Processing Agreements (DPAs)

**Location:** Configuration → DPAs

**Items to review:**
- [ ] DPA template covers all required clauses (processor obligations, sub-processor, data subject rights, audit rights, breach notification, deletion on termination)
- [ ] Supplier list is accurate and up-to-date
- [ ] Data categories per supplier are accurate
- [ ] Retention periods per supplier are appropriate
- [ ] Signature status is tracked

**Sign-off required from:** UAE-qualified legal adviser

---

## Sign-Off Record

| Item | Reviewer | Date | Status |
|---|---|---|---|
| Privacy Policy | ____________ | ____________ | ⏸ Pending |
| Consent Wording | ____________ | ____________ | ⏸ Pending |
| Retention Periods | ____________ | ____________ | ⏸ Pending |
| DSR Templates | ____________ | ____________ | ⏸ Pending |
| Cross-Border Log | ____________ | ____________ | ⏸ Pending |
| DPAs | ____________ | ____________ | ⏸ Pending |

---

**Once all items are signed off, update the Pre-Flight Checklist manual items and proceed to Go-Live.**
