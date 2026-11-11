import { getSupabaseClient } from "./supabase/client";
import { withDerivedFees, sanitiseFeeSettings, applyFeeTokens, FEE_POLICY_DEFAULTS } from "./fees";
import {
  feeBands as seedFeeBands, siteSettings as seedSiteSettings, faqEntries as seedFaqEntries,
  termDates as seedTermDates, testimonials as seedTestimonials, staffMembers as seedStaffMembers,
  differentiators as seedDifferentiators, policyLinks as seedPolicyLinks,
  homepageContent as seedHomepageContent, aboutContent as seedAboutContent, curriculumContent as seedCurriculumContent,
  curriculumDocuments as seedCurriculumDocuments,
  type FeeBand, type FaqEntry, type TermDate, type Testimonial, type StaffMember, type Differentiator, type PolicyLink, type SiteSettings,
  type HomepageContent, type AboutContent, type CurriculumContent, type CurriculumDocument,
} from "@/content/seed";
import { keyStages as seedKeyStages, type KeyStage } from "@/content/curriculum";

/** Every getter below reads live content from Supabase (0025_website_content.sql
 * and later migrations), and falls back to bundled seed content (same shape)
 * whenever Supabase isn't configured or a query fails/returns nothing. This
 * used to read from Sanity, moved so every piece of content (marketing site
 * + the /learn portal) is managed from one place, editable at
 * /learn/admin/content, rather than a separate CMS with its own login.
 *
 * This site is statically exported (output: "export"), so these queries only
 * ever run at build time, there is no server to re-fetch at request time.
 * An edit in /learn/admin/content appears on the next rebuild/redeploy
 * (triggered automatically on save, see that page), not instantly.
 *
 * Exceptions that are live immediately: the Policies page, the FAQs page and
 * the open-evening page re-read the database in the visitor's browser (the
 * getLive* functions below, which return null instead of falling back to the
 * seed), using the build-time copy only for the first paint and as the
 * fallback. */
async function queryOrFallback<T>(run: (supabase: NonNullable<ReturnType<typeof getSupabaseClient>>) => PromiseLike<{ data: unknown; error: unknown }>, fallback: T): Promise<T> {
  const supabase = getSupabaseClient();
  if (!supabase) return fallback;
  try {
    const { data, error } = await run(supabase);
    if (error) return fallback;
    if (Array.isArray(data) && data.length === 0) return fallback;
    if (data == null) return fallback;
    return data as T;
  } catch {
    return fallback;
  }
}

/** Fee bands. Only `annual_fee` is read as a fee number: termly/monthly are
 * DERIVED from it using the site-wide terms / instalments settings
 * (src/lib/fees.ts), so they always add up. Any stored termly_fee /
 * monthly_fee column value is ignored. */
export const getFeeBands = async (): Promise<FeeBand[]> => {
  const settings = await getSiteSettings();
  const rows = await queryOrFallback<FeeBand[]>(
    (s) => s.from("fee_bands").select("id, year_group_range, order_index, annual_fee, notes").order("order_index"),
    seedFeeBands
  );
  if (rows === seedFeeBands) {
    return seedFeeBands.map((b) => withDerivedFees(b, { terms: settings.feeTerms, instalments: settings.feeInstalments }));
  }
  return rows.map((r: unknown) => mapFeeBand(r as Record<string, unknown>, settings));
};

function mapFeeBand(r: Record<string, unknown>, settings: SiteSettings): FeeBand {
  return withDerivedFees(
    { _id: r.id as string, yearGroupRange: r.year_group_range as string, order: r.order_index as number, annualFee: Number(r.annual_fee), notes: (r.notes as string) || undefined },
    { terms: settings.feeTerms, instalments: settings.feeInstalments }
  );
}

/** Site settings straight from the database, or null when they cannot be read
 * (no connection configured, an error, or no row). The marketing pages use this
 * in the browser so a failed refresh keeps what the build rendered instead of
 * swapping in the bundled defaults. */
export const getLiveSiteSettings = async (): Promise<SiteSettings | null> => {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.from("site_settings").select("*").eq("id", true).maybeSingle();
    if (error || !data) return null;
    const r = data as Record<string, unknown>;
    const settings: SiteSettings = {
      launchDate: (r.launch_date as string) || undefined,
      ctaPrimaryLabel: (r.cta_primary_label as string) || undefined,
      ctaPrimaryHref: (r.cta_primary_href as string) || undefined,
      applicationFee: (r.application_fee as number) ?? undefined,
      depositAmount: r.admissions_deposit_amount != null ? Number(r.admissions_deposit_amount) : undefined,
      feeTerms: sanitiseFeeSettings({ terms: r.fee_terms }).terms,
      feeInstalments: sanitiseFeeSettings({ instalments: r.fee_instalments }).instalments,
      annualDiscountPercent: r.annual_discount_percent != null && Number.isFinite(Number(r.annual_discount_percent)) ? Number(r.annual_discount_percent) : FEE_POLICY_DEFAULTS.annualDiscountPercent,
      paymentScheduleText: (r.payment_schedule_text as string) || FEE_POLICY_DEFAULTS.paymentScheduleText,
      onlinePaymentUrl: (r.online_payment_url as string) || undefined,
      siblingDiscountPercent: (r.sibling_discount_percent as number) ?? undefined,
      siblingDiscountNote: (r.sibling_discount_note as string) || undefined,
      discounts: (r.discounts as SiteSettings["discounts"]) || [],
      bookingWidgetUrl: (r.booking_widget_url as string) || undefined,
      openEveningRecordingUrl: (r.open_evening_recording_url as string) || undefined,
      portalUrl: (r.portal_url as string) || undefined,
      admissionsEmail: (r.admissions_email as string) || undefined,
      contactPhone: (r.contact_phone as string) || undefined,
      contactAddress: (r.contact_address as string) || undefined,
      openingHours: (r.opening_hours as string) || undefined,
      safeguardingLeadName: (r.safeguarding_lead_name as string) || undefined,
      safeguardingLeadContact: (r.safeguarding_lead_contact as string) || undefined,
      complaintsLastYear: (r.complaints_last_year as number) ?? undefined,
      registrationBody: (r.registration_body as string) || undefined,
      registrationNumber: (r.registration_number as string) || undefined,
      regulatoryStatusNote: (r.regulatory_status_note as string) || undefined,
      headteacherWelcomeQuote: (r.headteacher_welcome_quote as string) || undefined,
      headteacherName: (r.headteacher_name as string) || undefined,
      policiesIntro: (r.policies_intro as string) || undefined,
      policiesAccessibleFormatsNote: (r.policies_accessible_formats_note as string) || undefined,
      sampleLessonVideoUrl: (r.sample_lesson_video_url as string) || undefined,
      sampleLessonNote: (r.sample_lesson_note as string) || undefined,
    };
    return settings;
  } catch {
    return null;
  }
};

export const getSiteSettings = async (): Promise<SiteSettings> => (await getLiveSiteSettings()) ?? seedSiteSettings;

export const getFaqEntries = async (): Promise<FaqEntry[]> => {
  const [settings, rows] = await Promise.all([
    getSiteSettings(),
    queryOrFallback<FaqEntry[]>(
      (s) => s.from("faq_entries").select("id, question, answer, category, order_index").order("order_index"),
      seedFaqEntries
    ),
  ]);
  const entries = rows === seedFaqEntries ? seedFaqEntries : rows.map((r: unknown) => mapFaq(r as Record<string, unknown>));
  // Fee figures quoted in FAQ copy use {{applicationFee}} /
  // {{terms}} / {{instalments}} tokens so they always match the live settings.
  const tokens = { applicationFee: settings.applicationFee, terms: settings.feeTerms, instalments: settings.feeInstalments, annualDiscountPercent: settings.annualDiscountPercent };
  return entries.map((e) => ({ ...e, answer: applyFeeTokens(e.answer, tokens) }));
};

/** FAQ entries straight from the database (answers with the live fee figures
 * filled in), or null when they cannot be read. Used by the browser to refresh
 * the page without a rebuild. */
export const getLiveFaqEntries = async (): Promise<FaqEntry[] | null> => {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  try {
    const [settings, res] = await Promise.all([
      getLiveSiteSettings(),
      supabase.from("faq_entries").select("id, question, answer, category, order_index").order("order_index"),
    ]);
    if (!settings || res.error || !Array.isArray(res.data)) return null;
    const tokens = { applicationFee: settings.applicationFee, terms: settings.feeTerms, instalments: settings.feeInstalments, annualDiscountPercent: settings.annualDiscountPercent };
    return res.data.map((r: unknown) => mapFaq(r as Record<string, unknown>)).map((e) => ({ ...e, answer: applyFeeTokens(e.answer, tokens) }));
  } catch {
    return null;
  }
};

function mapFaq(r: Record<string, unknown>): FaqEntry {
  return { _id: r.id as string, question: r.question as string, answer: r.answer as string, category: r.category as string, order: r.order_index as number };
}

export const getTermDates = () =>
  queryOrFallback<TermDate[]>(
    (s) => s.from("site_term_dates").select("id, label, kind, date, end_date, notes, confirmed").eq("confirmed", true).order("date"),
    seedTermDates.filter((d) => d.confirmed)
  ).then((rows) => (rows === seedTermDates ? rows : rows.map((r: unknown) => mapTermDate(r as Record<string, unknown>))));

function mapTermDate(r: Record<string, unknown>): TermDate {
  return { _id: r.id as string, label: r.label as string, kind: r.kind as string, date: r.date as string, endDate: (r.end_date as string) || undefined, notes: (r.notes as string) || undefined, confirmed: r.confirmed as boolean };
}

export const getTestimonials = () =>
  queryOrFallback<Testimonial[]>(
    (s) => s.from("testimonials").select("id, quote, attribution, role, is_placeholder, order_index").order("order_index"),
    seedTestimonials
  ).then((rows) => (rows === seedTestimonials ? rows : rows.map((r: unknown) => mapTestimonial(r as Record<string, unknown>))));

function mapTestimonial(r: Record<string, unknown>): Testimonial {
  return { _id: r.id as string, quote: r.quote as string, attribution: r.attribution as string, role: r.role as Testimonial["role"], isPlaceholder: r.is_placeholder as boolean, order: r.order_index as number };
}

export const getStaffMembers = () =>
  queryOrFallback<StaffMember[]>(
    (s) => s.from("team_profiles").select("id, name, role_title, qualifications, intro_video_url, is_placeholder, order_index").order("order_index"),
    seedStaffMembers
  ).then((rows) => (rows === seedStaffMembers ? rows : rows.map((r: unknown) => mapStaffMember(r as Record<string, unknown>))));

function mapStaffMember(r: Record<string, unknown>): StaffMember {
  return { _id: r.id as string, name: r.name as string, roleTitle: r.role_title as string, qualifications: (r.qualifications as string) || undefined, introVideoUrl: (r.intro_video_url as string) || undefined, isPlaceholder: r.is_placeholder as boolean, order: r.order_index as number };
}

export const getDifferentiators = () => {
  // Keep a reference to the exact fallback array so it can be recognised
  // below (it was previously compared against seedDifferentiators itself,
  // which never matched the filtered copy, so seed rows lost their _id).
  const fallback = seedDifferentiators.filter((d) => d.visible);
  return queryOrFallback<Differentiator[]>(
    (s) => s.from("differentiators").select("id, title, summary, detail, icon, status, visible, order_index").eq("visible", true).order("order_index"),
    fallback
  ).then((rows) => (rows === fallback ? rows : rows.map((r: unknown) => mapDifferentiator(r as Record<string, unknown>))));
};

function mapDifferentiator(r: Record<string, unknown>): Differentiator {
  return { _id: r.id as string, title: r.title as string, summary: r.summary as string, detail: (r.detail as string) || undefined, icon: (r.icon as string) || undefined, status: r.status as Differentiator["status"], visible: r.visible as boolean, order: r.order_index as number };
}

export const getPolicyLinks = () =>
  queryOrFallback<PolicyLink[]>(
    (s) => s.from("policy_links").select("id, number, title, category, parent_question_category, file_url, summary, last_reviewed, next_review, order_index, featured, slug, body_md, file_path").eq("visibility", "public").order("order_index"),
    seedPolicyLinks
  ).then((rows) =>
    rows === seedPolicyLinks
      // The bundled policies all have markdown in content/policies/, so each one has a readable page too.
      ? rows.map((p) => ({ ...p, readUrl: p.readUrl ?? (p.fileUrl.match(/^\/policies\/([a-z0-9][a-z0-9-]*)\.pdf$/)?.[1] ? `/policies/${p.fileUrl.match(/^\/policies\/([a-z0-9][a-z0-9-]*)\.pdf$/)![1]}/` : undefined) }))
      : rows.map((r: unknown) => mapPolicyLink(r as Record<string, unknown>))
  );

/** The policies straight from the database (removed ones are hidden by RLS), or
 * null when they cannot be read. Used by the browser so a policy edit shows on
 * the Policies page immediately, without a site rebuild. */
export const getLivePolicyLinks = async (): Promise<PolicyLink[] | null> => {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("policy_links")
      .select("id, number, title, category, parent_question_category, file_url, summary, last_reviewed, next_review, order_index, featured, slug, body_md, file_path")
      .eq("visibility", "public")
      .order("order_index");
    if (error || !Array.isArray(data)) return null;
    return data.map((r: unknown) => mapPolicyLink(r as Record<string, unknown>));
  } catch {
    return null;
  }
};

function mapPolicyLink(r: Record<string, unknown>): PolicyLink {
  return {
    _id: r.id as string, number: r.number as string, title: r.title as string, category: r.category as PolicyLink["category"],
    parentQuestionCategory: (r.parent_question_category as PolicyLink["parentQuestionCategory"]) || undefined,
    fileUrl: r.file_url as string, summary: (r.summary as string) || undefined,
    lastReviewed: (r.last_reviewed as string) || undefined, nextReview: (r.next_review as string) || undefined, order: r.order_index as number,
    featured: r.featured === true,
    readUrl: r.slug && r.body_md && !r.file_path ? `/policies/${r.slug as string}/` : undefined,
  };
}

/** Key-stage curriculum pages (/curriculum/<slug>): subjects, live lessons a
 * week and intro text, editable at /learn/admin/content -> Curriculum page.
 * Falls back to src/content/curriculum.ts. Hidden pages (visible = false) are
 * left out, so they disappear from the curriculum index, nav and sitemap on
 * the next rebuild. */
export const getKeyStages = () =>
  queryOrFallback<KeyStage[]>(
    (s) => s.from("key_stage_pages").select("slug, range, title, intro, subjects, weekly, lesson_length, total_lessons, note, gcse_note, order_index").eq("visible", true).order("order_index"),
    seedKeyStages
  ).then((rows) => (rows === seedKeyStages ? rows : withEveryKeyStage(rows.map((r: unknown) => mapKeyStage(r as Record<string, unknown>)))));

/** Older slugs still found in some databases, and the page each now lives at. */
const LEGACY_STAGE_SLUGS: Record<string, string> = { "reception-year-2": "year-1-2" };
const currentStageSlug = (slug: string) => LEGACY_STAGE_SLUGS[slug] || slug;

/** Every key stage page always exists, whatever the database holds: rows on
 * an old slug are moved to the current one, and any stage missing from the
 * database falls back to the built-in copy, so /curriculum/<stage>/ is
 * always built (a build that ran before a migration can't drop a page). */
function withEveryKeyStage(rows: KeyStage[]): KeyStage[] {
  const bySlug = new Map<string, KeyStage>();
  for (const r of rows) {
    const slug = currentStageSlug(r.slug);
    if (!bySlug.has(slug) || r.slug === slug) bySlug.set(slug, { ...r, slug });
  }
  for (const seed of seedKeyStages) if (!bySlug.has(seed.slug)) bySlug.set(seed.slug, seed);
  const order = seedKeyStages.map((k) => k.slug);
  return [...bySlug.values()].sort((a, b) => (order.indexOf(a.slug) + 1 || 99) - (order.indexOf(b.slug) + 1 || 99));
}

function mapKeyStage(r: Record<string, unknown>): KeyStage {
  const subjects = Array.isArray(r.subjects) ? (r.subjects as unknown[]).map(String) : [];
  const weekly = Array.isArray(r.weekly)
    ? (r.weekly as Record<string, unknown>[]).map((w) => ({ subject: String(w.subject ?? ""), lessons: typeof w.lessons === "number" ? w.lessons : String(w.lessons ?? "") }))
    : [];
  return {
    slug: r.slug as string, range: r.range as string, title: r.title as string, subjects, weekly,
    liveSplit: (r.intro as string) || "", lessonLength: (r.lesson_length as string) || "", totalLessons: (r.total_lessons as string) || "",
    note: (r.note as string) || undefined, gcseNote: (r.gcse_note as string) || undefined,
  };
}

export const getHomepageContent = async (): Promise<HomepageContent> => {
  const supabase = getSupabaseClient();
  if (!supabase) return seedHomepageContent;
  try {
    const { data, error } = await supabase.from("homepage_content").select("*").eq("id", true).maybeSingle();
    if (error || !data) return seedHomepageContent;
    const r = data as Record<string, unknown>;
    return {
      heroKicker: (r.hero_kicker as string) || undefined,
      heroHeading: (r.hero_heading as string) || undefined,
      heroBody: (r.hero_body as string) || undefined,
      pillars: (r.pillars as HomepageContent["pillars"]) || undefined,
      howItWorksHeading: (r.how_it_works_heading as string) || undefined,
      howItWorksSteps: (r.how_it_works_steps as HomepageContent["howItWorksSteps"]) || undefined,
      stagesHeading: (r.stages_heading as string) || undefined,
      stagesBody: (r.stages_body as string) || undefined,
      feeTeaserHeading: (r.fee_teaser_heading as string) || undefined,
      feeTeaserBody: (r.fee_teaser_body as string) || undefined,
      safeHeading: (r.safe_heading as string) || undefined,
      safeBody: (r.safe_body as string) || undefined,
    };
  } catch {
    return seedHomepageContent;
  }
};

export const getAboutContent = async (): Promise<AboutContent> => {
  const supabase = getSupabaseClient();
  if (!supabase) return seedAboutContent;
  try {
    const { data, error } = await supabase.from("about_content").select("*").eq("id", true).maybeSingle();
    if (error || !data) return seedAboutContent;
    const r = data as Record<string, unknown>;
    return {
      heroHeading: (r.hero_heading as string) || undefined,
      heroBody: (r.hero_body as string) || undefined,
      missionBody: (r.mission_body as string) || undefined,
      safeguardingBody: (r.safeguarding_body as string) || undefined,
      recipeIntro: (r.recipe_intro as string) || undefined,
      recipeItems: (r.recipe_items as AboutContent["recipeItems"]) || undefined,
      familyHeading: (r.family_heading as string) || undefined,
      familyBody: (r.family_body as string) || undefined,
    };
  } catch {
    return seedAboutContent;
  }
};

export const getCurriculumContent = async (): Promise<CurriculumContent> => {
  const supabase = getSupabaseClient();
  if (!supabase) return seedCurriculumContent;
  try {
    const { data, error } = await supabase.from("curriculum_content").select("*").eq("id", true).maybeSingle();
    if (error || !data) return seedCurriculumContent;
    const r = data as Record<string, unknown>;
    return { heroHeading: (r.hero_heading as string) || undefined, heroBody: (r.hero_body as string) || undefined };
  } catch {
    return seedCurriculumContent;
  }
};

export const getCurriculumDocuments = () =>
  queryOrFallback<CurriculumDocument[]>(
    (s) => s.from("curriculum_documents").select("id, key_stage, subject, title, term, file_url, order_index").order("order_index"),
    seedCurriculumDocuments
  ).then((rows) => (rows === seedCurriculumDocuments ? rows : rows.map((r: unknown) => mapCurriculumDocument(r as Record<string, unknown>))));

function mapCurriculumDocument(r: Record<string, unknown>): CurriculumDocument {
  return { _id: r.id as string, keyStage: currentStageSlug(r.key_stage as string), subject: r.subject as string, title: r.title as string, term: (r.term as CurriculumDocument["term"]) || undefined, fileUrl: r.file_url as string, order: r.order_index as number };
}
