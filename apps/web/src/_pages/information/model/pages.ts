/* eslint-disable max-len -- Editorial page copy is kept as complete sentences for easier review. */
export interface InformationSection {
  title: string;
  paragraphs: string[];
}

export interface InformationSource {
  label: string;
  href: string;
}

export interface InformationPageContent {
  path: string;
  eyebrow: string;
  title: string;
  description: string;
  lead: string;
  sections: InformationSection[];
  noindex?: boolean;
  sources?: InformationSource[];
  verificationNote?: string;
}

export const informationPages: Record<string, InformationPageContent> = {
  'how-to-use-berberine-patches': {
    path: '/how-to-use-berberine-patches',
    eyebrow: 'Using your patch',
    title: 'How to Use Berberine Patches',
    description: 'A practical checklist for reading Luvlae patch directions, applying to intact skin, and checking placement and wear time.',
    lead: 'Follow the directions on the box you have. Older sources give different wear times, so this page does not set a schedule or placement for your patch.',
    noindex: true,
    sections: [
      {
        title: 'Before applying a patch',
        paragraphs: [
          'Read the full ingredient, warning, and direction panels. Check where the label says to place the patch and how long it says to wear it. Do not use an older webpage or an illustration as a substitute for those directions.',
          'The captured seller directions say to apply a patch to clean, dry skin. Avoid broken or irritated skin, and follow any more specific instructions on your current package.',
        ],
      },
      {
        title: 'While wearing and removing it',
        paragraphs: [
          'Use the label for timing, removal, and replacement. Check the package before showering, swimming, exercising, or using skin products near the patch; water resistance and activity guidance have not been verified for the current product.',
          'If the adhesive is uncomfortable or your skin reacts, remove the patch and seek appropriate medical advice if needed.',
        ],
      },
    ],
    verificationNote: 'Current placement, wear duration, and water-resistance directions need confirmation from the actual package.',
  },
  'berberine-patch-safety': {
    path: '/berberine-patch-safety',
    eyebrow: 'Safety first',
    title: 'Berberine Patch Safety',
    description: 'Review skin-use precautions, medication and pregnancy questions, and the limits of available Luvlae patch safety evidence.',
    lead: 'Check the warnings on your current package before use. A patch may irritate skin, and research on berberine taken by mouth does not establish the safety profile of this finished topical product.',
    noindex: true,
    sections: [
      {
        title: 'Skin and adhesive',
        paragraphs: [
          'Apply only as the current label directs and avoid broken or irritated skin. Remove the patch if it causes a troublesome reaction. Ask a healthcare professional for advice if symptoms persist or concern you.',
          'The adhesive composition and finished-product skin testing have not been confirmed here. Check the package if you have a known adhesive or ingredient sensitivity.',
        ],
      },
      {
        title: 'Medication, pregnancy, and breastfeeding',
        paragraphs: [
          'NCCIH notes medicine interactions and pregnancy or breastfeeding concerns for berberine, primarily in the context of products taken by mouth. That evidence does not tell us the exposure from this patch. If any of these situations apply, discuss the exact current label with a qualified clinician before use.',
        ],
      },
      {
        title: 'What remains unknown',
        paragraphs: [
          'We have not verified a finished-product human safety study or the current complete ingredient panel. General information cannot replace individual medical advice or the warnings supplied with your box.',
        ],
      },
    ],
    sources: [
      { label: 'NCCIH: Berberine and Weight Loss — safety and interactions', href: 'https://www.nccih.nih.gov/health/berberine-and-weight-loss-what-you-need-to-know' },
    ],
    verificationNote: 'This page has not received a qualified medical review. Product-specific safety and label details remain unverified.',
  },
  'science/berberine-patches': {
    path: '/science/berberine-patches',
    eyebrow: 'Evidence by route',
    title: 'What Research Says About Berberine Patches',
    description: 'Compare research on oral berberine, experimental topical formulations, and the evidence available for the finished Luvlae patch.',
    lead: 'Human studies of oral berberine, animal studies of experimental topical formulations, and tests of a finished consumer patch answer different questions. None should be presented as proof for another route or product.',
    noindex: true,
    sections: [
      {
        title: 'Human evidence: berberine taken by mouth',
        paragraphs: [
          'NCCIH summarizes studies of oral berberine and weight-related outcomes as inconclusive. Study formulations and doses varied, and many studies had limitations. These findings cannot establish absorption, appetite effects, or weight outcomes for a Luvlae patch.',
        ],
      },
      {
        title: 'Preclinical evidence: experimental topical formulations',
        paragraphs: [
          'A 2018 study compared oral berberine with specialized topical berberine and dihydroberberine formulations in rats. Its acute experiment used 19 male rats across three groups and measured berberine exposure in blood over eight hours. The researchers also studied repeated administration. These were experimental formulations, not Luvlae adhesive patches, and the study did not test human appetite or weight outcomes.',
          'The authors reported a patent interest in their topical formulation. The animal results cannot establish absorption, efficacy, or safety for a different consumer patch.',
        ],
      },
      {
        title: 'Finished Luvlae patch evidence',
        paragraphs: [
          'No human clinical study, release test, or skin-permeation test for the finished Luvlae patch has been supplied. We therefore make no product-specific claim about absorption, dose delivered, duration of delivery, or health outcomes.',
        ],
      },
    ],
    sources: [
      { label: 'NCCIH: Berberine and Weight Loss — overview of oral research', href: 'https://www.nccih.nih.gov/health/berberine-and-weight-loss-what-you-need-to-know' },
      { label: 'Buchanan et al., PLOS ONE (2018) — rat pharmacokinetics of experimental topical formulations', href: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5868852/' },
    ],
    verificationNote: 'This is an evidence summary, not a clinical review of the finished product. A named author and qualified reviewer are still needed before this page is indexed.',
  },
  faq: {
    path: '/faq',
    eyebrow: 'Common questions',
    title: 'Frequently Asked Questions',
    description: 'Answers about the Luvlae patch count, current label directions, research limits, and buying through Amazon.',
    lead: 'Start with the current package for product-specific directions. These answers separate what the available listing shows from details that still need label confirmation.',
    noindex: true,
    sections: [
      {
        title: 'How many patches are in a box?',
        paragraphs: ['The available listing shows a 60-count box. Check the current Amazon listing before buying.'],
      },
      {
        title: 'How long should I wear one?',
        paragraphs: ['Wear-time instructions differ between older records. Follow the directions printed on the package you receive.'],
      },
      {
        title: 'Do oral berberine studies show that this patch works?',
        paragraphs: ['No. Oral studies examine a different route and formulation. We have not been supplied with a human efficacy study of the finished Luvlae patch.'],
      },
      {
        title: 'Where do I buy it?',
        paragraphs: ['The product link opens the Luvlae listing on Amazon, where current price, shipping, and return terms are shown.'],
      },
    ],
  },
  about: {
    path: '/about',
    eyebrow: 'About Luvlae',
    title: 'About Luvlae',
    description: 'Learn how Luvlae presents its berberine patches and separates product facts from ingredient research.',
    lead: 'Luvlae offers a pill-free berberine patch format. This site is organized around the questions people need answered before choosing and using the product.',
    noindex: true,
    sections: [
      {
        title: 'How we present product information',
        paragraphs: [
          'Product details should match the current package. We identify when a detail is still being checked, and we keep research about an ingredient separate from evidence for the finished patch.',
          'Amazon hosts the product listing and handles checkout, shipping, and applicable returns for purchases made there. Current terms are available on Amazon before you order.',
        ],
      },
    ],
    verificationNote: 'Business identity and direct support contact details still need confirmation before this page can serve as a complete company profile.',
  },
};

export const indexableInformationPaths = Object.values(informationPages)
  .filter(page => !page.noindex)
  .map(page => page.path);
