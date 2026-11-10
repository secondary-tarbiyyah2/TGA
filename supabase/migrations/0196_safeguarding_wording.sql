-- 0196: Prevent and LADO are no longer named as separate things; it all sits
-- under safeguarding (owner, 10 November 2026: "remove any reference to
-- Prevent or LADO, all of that we will categorise under safeguarding").
--
-- Wording only. The duties themselves are unchanged and still described:
-- protecting pupils from radicalisation (Counter-Terrorism and Security Act
-- 2015, s.26) and consulting the local authority about allegations against
-- staff (KCSIE Part Four).
--
--   * Policy 05 "No Platform for Extremism (Prevent) Policy" becomes
--     "Safeguarding: Extremism and Radicalisation Policy", address
--     /policies/05-safeguarding-extremism-and-radicalisation/ (the old address
--     redirects, public/.htaccess); whole text as in the markdown.
--   * Policies 01, 04, 11 and 22: the sentences that named Prevent, Channel or
--     the LADO, and the old title of policy 05.
-- The body-changed trigger is off, so nobody is asked to re-sign for a
-- wording change; body_updated_at is set so the PDFs rebuild. Idempotent.

alter table public.policy_links disable trigger policy_links_body_changed;

update public.policy_links
set title = 'Safeguarding: Extremism and Radicalisation Policy',
    slug = '05-safeguarding-extremism-and-radicalisation',
    file_url = '/policies/05-safeguarding-extremism-and-radicalisation.pdf',
    body_md = $pol05$## 1. Policy Statement

Tarbiyyah Global Academy is committed to providing a safe online environment in which pupils learn free from exposure to extremist views or ideologies, and in which they develop the knowledge and confidence to challenge them. Our Islamic ethos teaches justice, mercy, the sanctity of life and respect for others; these values are the strongest foundation for resisting those who would misuse faith, or any ideology, to justify hatred or violence. This policy is part of our safeguarding arrangements. It explains how the Academy meets its duty to protect pupils from being drawn into extremism in an online setting, how we keep our platforms free from extremist content, and how concerns are referred.

## 2. Legal Framework

- Counter-Terrorism and Security Act 2015, section 26, and its statutory guidance for England and Wales (2023), as good practice
- Terrorism Act 2000 and Terrorism Act 2006
- Keeping Children Safe in Education (current edition)
- Online Education Accreditation Scheme (OEAS) standards, used as a benchmark of good practice
- Equality Act 2010

## 3. Definitions

| Term | Meaning |
| --- | --- |
| Extremism | The Academy has regard to the government's 2024 definition: the promotion or advancement of an ideology based on violence, hatred or intolerance that aims to negate or destroy the fundamental rights and freedoms of others, or to undermine, overturn or replace the UK's system of liberal parliamentary democracy and democratic rights, or to intentionally create a permissive environment for others to achieve those results. For safeguarding purposes, staff also recognise vocal or active opposition to the fundamental British values of democracy, the rule of law, individual liberty and mutual respect and tolerance of different faiths and beliefs. |
| Radicalisation | The process by which a person comes to support terrorism and extremist ideologies associated with terrorist groups. Online radicalisation can happen through social media algorithms, gaming platforms, video sites and private messaging. |
| Terrorism | An action that endangers or causes serious violence, damage or disruption and is intended to influence the government or intimidate the public, for the purpose of advancing a political, religious or ideological cause. |
| Proscribed organisation | An organisation banned under the Terrorism Act 2000. No proscribed organisation or its representatives will be given access to Academy platforms, events or resources. |

Extremism can come from any ideology, including Islamist, extreme right-wing, extreme left-wing, single-issue, incel and mixed or unclear ideologies. Staff will not make assumptions about any group.

## 4. The No Platform Clause

Academy platforms — live lessons, portal channels, assignments, the Parent and Student Portals, email and virtual events — will not be used to promote, express or share extremist views. This includes:

- promoting any ideology that falls within the definitions above;
- advocating or inciting terrorism, violence or hatred;
- encouraging discrimination, harassment or victimisation of any person or group, including on the basis of a protected characteristic;
- posting, linking to or sharing extremist material, including via screen share, chat or uploaded files.

## 5. Virtual Guest Speakers and External Content

### Risk assessment

Every virtual guest speaker, webinar or external resource is approved in advance through a written risk assessment by the Headteacher or DSL, considering the speaker's or provider's background, the planned content, and whether there is any risk of extremist views or reputational harm.

### Controls

- A member of staff hosts every session and can mute, remove or end it at any time.
- Guest speakers cannot share their screen unless approved, and pupils cannot message guests privately.
- Slides or scripts are provided in advance where possible, and every session is recorded.
- Where a contested topic is discussed, balanced views are presented.

The Academy may decline or cancel any speaker or resource where the risk assessment raises concern.

## 6. Recognising Vulnerability Online

Staff are alert to changes that may be visible through online learning, including:

- expressing extreme or intolerant views in chat, discussion or written work;
- using language, symbols or references associated with extremist groups;
- sudden changes in behaviour, friendships, appearance or engagement;
- secretive use of devices or references to new online "mentors";
- justifying violence or expressing a sense of grievance that is being exploited.

None of these alone proves radicalisation; each is a reason to talk to the DSL.

## 7. Reporting and Referral

All staff report any concern to the DSL on the same day, using the online concern form. The DSL will consider the concern alongside other information, speak to the family where appropriate, and decide whether to refer:

- for pupils in England and Wales, to the local authority's safeguarding team, which can arrange specialist support where appropriate;
- for pupils living abroad, to the appropriate local authority, and to the police where there is a risk of harm.

In an emergency, staff call the police (999 in the UK) or the local emergency number. The DfE counter-extremism helpline (020 7340 7264, counter.extremism@education.gov.uk) is available for non-emergency advice.

## 8. Staff Training

All staff complete training on extremism and radicalisation as part of safeguarding training at induction, refreshed annually. The DSL completes enhanced training. Training covers online radicalisation, recognising indicators in live lessons and written work, and making referrals.

## 9. Teaching Pupils to be Resilient

- **PSHE and Citizenship:** challenging stereotypes, debating safely, recognising manipulation and propaganda.
- **Islamic Studies:** the Prophetic example of mercy, justice and mutual respect; understanding scholarly disagreement; why extremist groups misrepresent Islam.
- **History and English:** propaganda, human rights and the dangers of authoritarianism.
- **Online safety:** evaluating sources, recognising misinformation and algorithmic "rabbit holes", and knowing how to report.

Lessons provide a safe space, chaired by a teacher, to discuss difficult questions so that pupils do not seek answers from unsafe sources.

## 10. Extremism Risk Assessment

As part of the safeguarding risk assessment, the DSL maintains an extremism risk assessment, reviewed annually, covering online platforms, guest speakers, the curriculum, staff training and the Academy's international pupil population. The first is completed before live lessons begin on 11 January 2027 and is reviewed annually.

## 11. Monitoring and Review

This policy is reviewed annually by the DSL and Headteacher and approved by the Headteacher and agreed with the Chair of Trustees, or sooner if legislation, guidance or OEAS requirements change.$pol05$,
    meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object(
      'policyName', 'Safeguarding: Extremism and Radicalisation Policy 2026–2027',
      'owner', 'Designated Safeguarding Lead',
      'dateOfIssue', '1 September 2026 (version 1.2, updated 10 November 2026: renamed and filed under safeguarding; the duties are unchanged)'
    ),
    body_updated_at = now()
where number = '05' and title is distinct from 'Safeguarding: Extremism and Radicalisation Policy';

update public.policy_links
set body_md = regexp_replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(body_md,
      'No Platform for Extremism (Prevent) Policy', 'Safeguarding: Extremism and Radicalisation Policy'),
      'Local authority designated officer (LADO)', 'Local authority: allegations about staff'),
      'Hounslow LADO service', 'Hounslow safeguarding team (allegations)'),
      'Counter-Terrorism and Security Act 2015 and the Prevent Duty Guidance', 'Counter-Terrorism and Security Act 2015 and its statutory guidance'),
      'the police, Channel or the relevant authority', 'the police or the relevant authority'),
      'consult the LADO within', 'consult the local authority''s allegations officer within'),
      'KCSIE changes and Prevent awareness', 'KCSIE changes, and extremism and radicalisation awareness'),
      'or the LADO, where required', 'or the local authority, where required'),
      '| Prevent | Online radicalisation;', '| Safeguarding: extremism | Online radicalisation;'),
      E'\\| Prevent Lead \\|[^\\n]*\\n', '', 'g'),
    meta = (replace(meta::text, 'No Platform for Extremism (Prevent) Policy', 'Safeguarding: Extremism and Radicalisation Policy'))::jsonb,
    body_updated_at = now()
where number in ('01', '04', '11', '22')
  and (body_md like '%Prevent%' or body_md like '%LADO%' or body_md like '%Channel or%' or meta::text like '%(Prevent)%');

alter table public.policy_links enable trigger policy_links_body_changed;
