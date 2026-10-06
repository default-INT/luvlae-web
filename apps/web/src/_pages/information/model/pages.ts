/* eslint-disable max-len -- Editorial page copy is kept as complete sentences for easier review. */
export interface InformationSection {
  title: string;
  paragraphs: string[];
  link?: {
    label: string;
    href: string;
  };
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
  headline?: string;
  sections: InformationSection[];
  noindex?: boolean;
  sources?: InformationSource[];
  verificationNote?: string;
}

export const informationPages: Record<string, InformationPageContent> = {
  'how-to-use-berberine-patches': {
    path: '/how-to-use-berberine-patches',
    eyebrow: 'How to use',
    title: 'How to Use',
    headline: 'Your daily patch routine<br>in four simple steps',
    description: 'A few easy steps to apply and remove your Luvlae Berberine Patch. Read the package directions before your first use.',
    lead: 'A few easy steps to apply and remove your Luvlae Berberine Patch. Read the package directions before your first use.',
    noindex: true,
    sections: [
      {
        title: '01 — Prepare your skin',
        paragraphs: [
          'Choose an application area recommended on the package. Make sure the skin is clean, dry, and free from lotions or oils. Avoid broken or irritated skin.',
        ],
      },
      {
        title: '02 — Peel and apply',
        paragraphs: [
          'Remove the protective backing and place the adhesive side onto your skin. Press gently to secure the patch, smoothing down the edges.',
        ],
      },
      {
        title: '03 — Follow the wear time',
        paragraphs: [
          'Wear the patch for the duration stated on your package. Follow the instructions for daily use and replacement.',
        ],
      },
      {
        title: '04 — Remove gently',
        paragraphs: [
          'Slowly peel the patch away from your skin and discard it after use.',
        ],
      },
      {
        title: 'A little care goes a long way',
        paragraphs: [
          'For external use only. Remove the patch if redness, itching, or discomfort occurs. Check the package for guidance on showering, swimming, and exercise.',
        ],
      },
    ],
  },
  'berberine-patch-safety': {
    path: '/berberine-patch-safety',
    eyebrow: 'Safety first',
    title: 'Safety',
    headline: 'Before you apply',
    description: 'Read the ingredients, directions, and warnings on your package before using Luvlae Berberine Patches.',
    lead: 'Read the ingredients, directions, and warnings on your package before using Luvlae Berberine Patches.',
    noindex: true,
    sections: [
      {
        title: 'Care for your skin',
        paragraphs: [
          'Apply only to clean, dry, intact skin as directed. Avoid broken or irritated areas and contact with eyes or mucous membranes.',
        ],
      },
      {
        title: 'Check for sensitivities',
        paragraphs: [
          'Do not use if you have a known allergy to any listed ingredient or the patch adhesive.',
        ],
      },
      {
        title: 'Listen to your skin',
        paragraphs: [
          'Remove the patch and stop use if redness, itching, burning, or discomfort occurs. Seek medical advice if symptoms persist or worsen.',
        ],
      },
      {
        title: 'Pregnancy and breastfeeding',
        paragraphs: [
          'As a precaution, do not use during pregnancy or while breastfeeding.',
        ],
      },
      {
        title: 'Medications and health conditions',
        paragraphs: [
          'If you take medication or have a medical condition, consult a healthcare professional before use and show them the full ingredient list.',
        ],
      },
      {
        title: 'Keep in mind',
        paragraphs: [
          'For external use only. Do not swallow. Keep out of reach of children and pets. Follow the package instructions for wear time and storage.',
        ],
      },
      {
        title: 'Questions about application?',
        paragraphs: [],
        link: {
          label: 'Visit our step-by-step guide.',
          href: '/how-to-use-berberine-patches',
        },
      },
    ],
  },
  'science/berberine-patches': {
    path: '/science/berberine-patches',
    eyebrow: 'Science & ingredients',
    title: 'Science & Ingredients',
    headline: 'Understanding the science<br>behind berberine',
    description: 'Berberine has a long history of traditional use and is an active area of scientific research. Understanding that research starts with looking at the formulation, dose, and method of use.',
    lead: 'Berberine has a long history of traditional use and is an active area of scientific research. Understanding that research starts with looking at the formulation, dose, and method of use.',
    noindex: true,
    sections: [
      {
        title: 'What is berberine?',
        paragraphs: [
          'Berberine is a naturally occurring compound found in plants such as barberry and goldenseal. Plants containing berberine have been used in traditional Chinese and Ayurvedic practices for centuries.',
        ],
      },
      {
        title: 'What are researchers exploring?',
        paragraphs: [
          'Researchers are studying berberine’s potential effects on glucose metabolism, blood lipids, and other aspects of metabolic health. Most human research involves berberine taken by mouth, with findings that vary across studies.',
        ],
      },
      {
        title: 'Why does the format matter?',
        paragraphs: [
          'An oral supplement and a topical patch deliver ingredients in different ways. Findings from oral studies cannot establish how much berberine a patch delivers or what effects it produces.',
        ],
      },
      {
        title: 'Our approach at Luvlae',
        paragraphs: [
          'We distinguish ingredient research from evidence about our finished patches. This page provides background on berberine; it does not present those studies as clinical proof of Luvlae patch benefits.',
        ],
      },
      {
        title: 'Explore the formula',
        paragraphs: [
          'Discover the ingredients listed in Luvlae Berberine Patches and learn more about their individual characteristics.',
        ],
        link: {
          label: 'View ingredients →',
          href: '/ingredients',
        },
      },
    ],
  },
  faq: {
    path: '/faq',
    eyebrow: 'FAQ',
    title: 'FAQ',
    headline: 'Your questions, answered',
    description: 'Everything you need to know about your daily patch routine.',
    lead: 'Everything you need to know about your daily patch routine.',
    noindex: true,
    sections: [
      {
        title: 'What are Luvlae Berberine Patches?',
        paragraphs: ['They are topical adhesive patches containing berberine and other listed ingredients, in a discreet, pill-free format.'],
      },
      {
        title: 'How many patches come in a box?',
        paragraphs: ['Each box contains 60 patches — a 60-day supply when used once daily.'],
      },
      {
        title: 'How do I apply a patch?',
        paragraphs: ['Peel off the protective backing, apply to clean, dry, intact skin in an area recommended on the package, and gently press down the edges.'],
      },
      {
        title: 'How long should I wear each patch?',
        paragraphs: ['Follow the wear time printed on your package. Remove the patch earlier if you experience irritation or discomfort.'],
      },
      {
        title: 'Can I wear a patch under clothing?',
        paragraphs: ['Yes. Choose an application area recommended on the package where clothing will not rub against or loosen the patch.'],
      },
      {
        title: 'Can I shower, swim, or exercise while wearing it?',
        paragraphs: ['Check the package instructions for guidance on water exposure and exercise. Do not assume the patch is waterproof.'],
      },
      {
        title: 'What if I have sensitive skin?',
        paragraphs: ['Review the ingredients before use. Do not use if you have a known allergy to any ingredient or the adhesive. Stop use if redness, itching, or discomfort occurs.'],
      },
      {
        title: 'Are patches the same as oral berberine supplements?',
        paragraphs: ['No. The formats differ, and studies of oral berberine do not establish absorption or benefits from Luvlae patches.'],
      },
      {
        title: 'Can I use the patches while taking medication?',
        paragraphs: ['Consult a healthcare professional before use and show them the full ingredient list, especially if you take medication or have a medical condition.'],
      },
      {
        title: 'Can I use them during pregnancy or breastfeeding?',
        paragraphs: ['As a precaution, do not use during pregnancy or while breastfeeding.'],
      },
      {
        title: 'How should I store the patches?',
        paragraphs: ['Follow the storage instructions on the package. Keep them out of reach of children and pets.'],
      },
      {
        title: 'Where can I buy Luvlae Berberine Patches?',
        paragraphs: ['Visit our Amazon listing for current pricing, availability, and delivery options.'],
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
