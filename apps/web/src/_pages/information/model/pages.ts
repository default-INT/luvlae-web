/* eslint-disable max-len -- Editorial page copy is kept as complete sentences for easier review. */

export interface InformationSection {
  title: string;
  paragraphs: string[];
}

export interface InformationPageContent {
  path: string;
  eyebrow: string;
  title: string;
  description: string;
  lead: string;
  sections: InformationSection[];
  noindex?: boolean;
  image?: boolean;
}

export const informationPages: Record<string, InformationPageContent> = {
  'products/berberine-patches': {
    path: '/products/berberine-patches',
    eyebrow: 'The product',
    title: 'Luvlae Berberine Patches',
    description: 'Explore the Luvlae 60-count berberine patch format, what is known about the product, and what to check before use.',
    lead: 'Luvlae Berberine Patches are offered in a 60-count box. They provide a pill-free format for people exploring a daily wellness routine. Purchase and fulfillment take place on Amazon.',
    image: true,
    sections: [
      {
        title: 'What is confirmed',
        paragraphs: [
          'The captured Amazon listing identifies the product as Luvlae Berberine Patches and advertises 60 patches. It names berberine in the product title.',
          'Formula details and wear directions differ between available source records. Check the current package label before use; this site does not present an unverified ingredient panel or wear time.',
        ],
      },
      {
        title: 'A note on benefits and evidence',
        paragraphs: [
          'Luvlae presents the patch as a product intended to complement everyday habits. Research on oral berberine cannot establish absorption or outcomes for this finished topical patch.',
          'No Luvlae-specific human clinical study was supplied in the project sources. Learn more on the Science page before interpreting general berberine research as evidence for this product.',
        ],
      },
      {
        title: 'Before you buy',
        paragraphs: [
          'Review the current ingredient label, directions, warnings, price, availability, and return terms on Amazon. Those marketplace details may change.',
        ],
      },
    ],
  },
  ingredients: {
    path: '/ingredients',
    eyebrow: 'Product details',
    title: 'Berberine Patch Ingredients',
    description: 'What is currently known about Luvlae Berberine Patches ingredients and why the complete formula is awaiting label verification.',
    lead: 'The available records conflict on the full formula. We are holding back an ingredient panel and amounts until they can be checked against the current package label.',
    noindex: true,
    sections: [
      {
        title: 'What the available listing says',
        paragraphs: [
          'The captured Amazon title names berberine, L-glutamine, and Garcinia Cambogia. A separate SEO strategy cites a different group of ingredients and amounts from a prior site snapshot.',
          'These records may represent different product versions or variants. Combining them would create an unreliable specification, so we do not do that here.',
        ],
      },
      {
        title: 'How to verify your box',
        paragraphs: [
          'Read the ingredient and warning panels on the package you receive. If you have sensitivities or take medication, discuss the exact label with a healthcare professional before use.',
        ],
      },
    ],
  },
  'how-to-use-berberine-patches': {
    path: '/how-to-use-berberine-patches',
    eyebrow: 'Daily routine',
    title: 'How to Use Berberine Patches',
    description: 'A practical guide to checking the current Luvlae patch directions, skin care, and questions about placement and wear time.',
    lead: 'Start with the directions on the current package. Source records available to this project disagree about wear time, so no universal schedule is stated here.',
    noindex: true,
    sections: [
      {
        title: 'Before application',
        paragraphs: [
          'Read the current package directions and warnings in full. The captured seller instructions say to apply a patch to clean, dry skin, but confirm the current label before use.',
          'Do not apply to irritated or broken skin. If the adhesive causes discomfort, remove the patch and seek appropriate guidance.',
        ],
      },
      {
        title: 'Placement and wear time',
        paragraphs: [
          'The project sources do not establish a single current placement instruction or wear duration. Follow the package in hand rather than older online descriptions or lifestyle imagery.',
        ],
      },
    ],
  },
  'berberine-patch-safety': {
    path: '/berberine-patch-safety',
    eyebrow: 'Use thoughtfully',
    title: 'Berberine Patch Safety',
    description: 'Skin-use precautions and important questions to discuss with a clinician before using Luvlae Berberine Patches.',
    lead: 'A topical patch can still cause skin irritation or raise questions about ingredients and individual health circumstances. Use the current package warnings as your primary product guide.',
    noindex: true,
    sections: [
      {
        title: 'Skin and adhesive',
        paragraphs: [
          'Avoid applying a patch to broken or irritated skin. Stop use if you notice a troublesome reaction and seek medical advice when needed.',
        ],
      },
      {
        title: 'Medications and health circumstances',
        paragraphs: [
          'If you are pregnant or nursing, take prescription medication, or manage a health condition, speak with a qualified healthcare professional about the exact current formula before use.',
          'This page is general information and has not been medically reviewed. It is not a substitute for individualized medical advice.',
        ],
      },
    ],
  },
  'science/berberine-patches': {
    path: '/science/berberine-patches',
    eyebrow: 'Evidence explained',
    title: 'What Research Says About Berberine Patches',
    description: 'Understand the difference between oral berberine studies, preclinical transdermal research, and evidence for a finished consumer patch.',
    lead: 'The route of administration and finished formulation matter. Evidence for oral berberine cannot be treated as proof of the same absorption or outcomes from a topical patch.',
    noindex: true,
    sections: [
      {
        title: 'Human research on oral berberine',
        paragraphs: [
          'Many discussions of berberine refer to capsules or other oral products. Those studies involve a different route and formulation from a topical patch.',
        ],
      },
      {
        title: 'Transdermal research',
        paragraphs: [
          'Early transdermal work may explore delivery concepts in laboratory or preclinical settings. Animal or laboratory findings do not establish human efficacy or bioavailability for a consumer patch.',
        ],
      },
      {
        title: 'Finished-product evidence',
        paragraphs: [
          'No Luvlae-specific human clinical study, release study, or permeation study was supplied in the project sources. Product-specific claims about absorption, duration, or outcomes would require relevant evidence.',
        ],
      },
    ],
  },
  faq: {
    path: '/faq',
    eyebrow: 'Your questions',
    title: 'Frequently Asked Questions',
    description: 'Answers to common questions about Luvlae Berberine Patches, current directions, ingredients, evidence, and Amazon purchases.',
    noindex: true,
    lead: 'Here are the details we can state clearly from the available sources, plus the points that still need the current product label.',
    sections: [
      {
        title: 'How many patches are in a box?',
        paragraphs: ['The captured Amazon listing advertises 60 patches. Confirm the current listing and package before purchase.'],
      },
      {
        title: 'How long should I wear one?',
        paragraphs: ['Available source records conflict on wear duration. Follow the directions on your current package.'],
      },
      {
        title: 'Are these the same as GLP-1 medications?',
        paragraphs: ['No. Luvlae patches are not prescription GLP-1 medication and do not contain semaglutide.'],
      },
      {
        title: 'Where do I buy them?',
        paragraphs: ['The current site links to the Luvlae product listing on Amazon. Amazon handles the purchase, fulfillment, and applicable returns.'],
      },
    ],
  },
  about: {
    path: '/about',
    eyebrow: 'About Luvlae',
    title: 'A More Informed Everyday Routine',
    description: 'Learn how Luvlae presents its berberine patch product and why this site separates product facts from broader research.',
    lead: 'Luvlae offers a pill-free berberine patch format. This site is being built to make product information, directions, safety, and evidence easier to find and understand.',
    noindex: true,
    sections: [
      {
        title: 'Our approach to information',
        paragraphs: [
          'We identify what is confirmed in available product records, what comes from seller copy, and what still requires a current label or product-specific evidence.',
          'Purchase details live on Amazon. Check the current listing for price, availability, shipping, and return terms.',
        ],
      },
    ],
  },
};

export const indexableInformationPaths = Object.values(informationPages)
  .filter(page => !page.noindex)
  .map(page => page.path);
