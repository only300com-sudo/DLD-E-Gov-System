// src/lib/fees/calculate.ts
// Part 9.5 / Step 3 — Fee calculation service.
//
// Reads the FeeCatalog table and computes fees for a case context. Supports:
//   - 'fixed':       fixedAmount applies (in fils)
//   - 'percentage':  baseField * percentageRate, with optional percentageFloor
//   - 'tiered':      if base >= tierThreshold use tierAmountAbove else tierAmountBelow
//
// All amounts in the FeeCatalog are in fils (1 AED = 100 fils). The service
// returns amounts in AED (baseAmount, vatAmount, totalAmount) rounded to 2 dp.
//
// Mutual exclusion: fees with mutualExclusionGroup only keep one per group.
// For 'map_fee' specifically, DUBAI_MUNI_MAP wins if propertyIsInDubaiMunicipality,
// else NON_DUBAI_MAP wins.
//
// dropWhen: skip a fee if context[field] === equals (e.g. REGISTRAR_RELEASE_FEE
// is dropped when newMortgageSameDay === true).
//
// perProperty: multiply fixedAmount by propertyCount (used for portfolio title deeds).

import { db } from "@/lib/db";

export interface FeeContext {
  procedureCatalogId: string;
  saleValue?: number;            // in fils
  propertyValue?: number;        // in fils
  mortgageAmount?: number;       // in fils
  rentalValue?: number;          // in fils
  amendedValueChange?: number;   // in fils
  portfolioLoanAmount?: number;  // in fils
  propertyCount?: number;
  propertyIsInDubaiMunicipality?: boolean;
  newMortgageSameDay?: boolean;
  [key: string]: unknown;
}

export interface ComputedFee {
  code: string;
  nameEn: string;
  nameAr: string;
  category: string;
  baseAmount: number;            // in AED (2 dp)
  vatAmount: number;             // in AED (2 dp)
  totalAmount: number;           // in AED (2 dp)
  quantity?: number;             // for perProperty fees
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function calculateFees(ctx: FeeContext): Promise<ComputedFee[]> {
  const allFees = await db.feeCatalog.findMany({ where: { isActive: true } });
  const computed: ComputedFee[] = [];

  for (const fee of allFees) {
    const appliesTo = JSON.parse(fee.appliesToProcedures) as string[];
    if (!appliesTo.includes("*") && !appliesTo.includes(ctx.procedureCatalogId)) continue;

    // dropWhen — conditional skip
    if (fee.dropWhen) {
      const cond = JSON.parse(fee.dropWhen) as { field: string; equals: unknown };
      if (ctx[cond.field] === cond.equals) continue;
    }

    let baseAmountFils = 0;
    const quantity = fee.perProperty ? (ctx.propertyCount ?? 1) : 1;

    if (fee.feeType === "fixed") {
      baseAmountFils = (fee.fixedAmount ?? 0) * quantity;
    } else if (fee.feeType === "percentage") {
      const field = fee.baseField ?? "saleValue";
      const base = (ctx[field] as number | undefined) ?? 0;
      baseAmountFils = Math.round(base * (fee.percentageRate ?? 0));
      if (fee.percentageFloor != null && baseAmountFils < fee.percentageFloor) {
        baseAmountFils = fee.percentageFloor;
      }
      baseAmountFils *= quantity;
    } else if (fee.feeType === "tiered") {
      const field = fee.baseField ?? "saleValue";
      const base = (ctx[field] as number | undefined) ?? 0;
      const threshold = fee.tierThreshold ?? 0;
      baseAmountFils = (base >= threshold ? (fee.tierAmountAbove ?? 0) : (fee.tierAmountBelow ?? 0)) * quantity;
    }

    const baseAmount = baseAmountFils / 100; // fils → AED
    const vatAmount = fee.vatApplicable ? round2(baseAmount * (fee.vatRate ?? 0.05)) : 0;

    computed.push({
      code: fee.code,
      nameEn: fee.nameEn,
      nameAr: fee.nameAr,
      category: fee.feeCategory,
      baseAmount: round2(baseAmount),
      vatAmount,
      totalAmount: round2(baseAmount + vatAmount),
      ...(fee.perProperty && { quantity }),
    });
  }

  // Enforce mutual exclusion — only one fee per group survives.
  // For 'map_fee': DUBAI_MUNI_MAP wins if propertyIsInDubaiMunicipality !== false,
  // else NON_DUBAI_MAP wins.
  const seenGroups = new Map<string, ComputedFee>();
  const noGroup: ComputedFee[] = [];
  for (const f of computed) {
    const group = allFees.find(x => x.code === f.code)?.mutualExclusionGroup;
    if (!group) { noGroup.push(f); continue; }
    const preferredCode = ctx.propertyIsInDubaiMunicipality === false
      ? "NON_DUBAI_MAP"
      : "DUBAI_MUNI_MAP";
    if (f.code === preferredCode) seenGroups.set(group, f);
    else if (!seenGroups.has(group)) seenGroups.set(group, f);
  }

  return [...noGroup, ...seenGroups.values()];
}
