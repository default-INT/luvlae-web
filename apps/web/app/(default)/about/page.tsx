import { getInformationMetadata, InformationPage, informationPages } from '@/_pages/information';

const content = informationPages.about;

export const dynamic = 'force-static';
export const metadata = getInformationMetadata(content);

export default function AboutRoute() {
  return <InformationPage content={content}/>;
}
