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
    description: 'A practical guide to preparing, applying, and caring for your Luvlae patches.',
    lead: 'Review the directions included with your patches before starting your routine.',
    noindex: true,
    sections: [
      {
        title: 'Before applying a patch',
        paragraphs: [
          'Read the ingredient, warning, and direction panels before applying your patch.',
          'Apply to clean, dry skin and avoid broken or irritated areas.',
        ],
      },
      {
        title: 'While wearing and removing it',
        paragraphs: [
          'Follow the included guidance for timing, removal, and replacement.',
          'If the adhesive is uncomfortable or your skin reacts, remove the patch and seek appropriate medical advice if needed.',
        ],
      },
    ],
  },
  'berberine-patch-safety': {
    path: '/berberine-patch-safety',
    eyebrow: 'Safety first',
    title: 'Berberine Patch Safety',
    description: 'Review skin-use precautions, medication and pregnancy questions, and the limits of available Luvlae patch safety evidence.',
    lead: 'Review the included warnings before use. A patch may irritate skin, so pay attention to how your skin feels.',
    noindex: true,
    sections: [
      {
        title: 'Skin and adhesive',
        paragraphs: [
          'Apply only as directed and avoid broken or irritated skin. Remove the patch if it causes a troublesome reaction. Ask a healthcare professional for advice if symptoms persist or concern you.',
          'If you have a known adhesive or ingredient sensitivity, review the ingredient information before use.',
        ],
      },
      {
        title: 'Medication, pregnancy, and breastfeeding',
        paragraphs: [
          'If you take medication, are pregnant, or are breastfeeding, speak with a qualified clinician before use.',
        ],
      },
      {
        title: 'Make informed choices',
        paragraphs: [
          'General information cannot replace individual medical advice. Follow the included warnings and contact a clinician with any questions.',
        ],
      },
    ],
    sources: [
      { label: 'NCCIH: Berberine and Weight Loss — safety and interactions', href: 'https://www.nccih.nih.gov/health/berberine-and-weight-loss-what-you-need-to-know' },
    ],
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
  },
  faq: {
    path: '/faq',
    eyebrow: 'Common questions',
    title: 'Frequently Asked Questions',
    description: 'Answers about Luvlae patches, daily use, research, and buying through Amazon.',
    lead: 'Find helpful answers about the Luvlae patch format and everyday use.',
    noindex: true,
    sections: [
      {
        title: 'How many patches are in a box?',
        paragraphs: ['Each box includes 60 Luvlae Berberine Patches.'],
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
          'We share product details, ingredients, and practical guidance to help you explore the Luvlae patch format.',
          'Amazon hosts the product listing and handles checkout, shipping, and applicable returns for purchases made there.',
        ],
      },
    ],
  },
};

export const indexableInformationPaths = Object.values(informationPages)
  .filter(page => !page.noindex)
  .map(page => page.path);
