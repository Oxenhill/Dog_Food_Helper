'use client';

import AdminShell from '@/components/AdminShell';
import ManufacturerDomainsReviewAdmin from '@/components/ManufacturerDomainsReviewAdmin';

export default function ManufacturerDomainsPage() {
  return (
    <AdminShell eyebrow="Studio" title="Manufacturer domain review">
      <p className="help-text">
        Approval candidates and novel clauses only — every domain terms_clause_patterns could confidently
        refuse has already been auto-applied and never reaches this screen (FOOD_DISCOVERY_DESIGN.md sec5.4).
      </p>
      <ManufacturerDomainsReviewAdmin />
    </AdminShell>
  );
}
