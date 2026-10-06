import { getInformationMetadata, InformationPage, informationPages } from '@/_pages/information';

const content = informationPages.faq;

export const dynamic = 'force-static';
export const metadata = getInformationMetadata(content);

export default function FaqRoute() {
  return <InformationPage content={content}/>;
}
