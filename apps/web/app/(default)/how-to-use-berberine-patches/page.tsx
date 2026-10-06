import { getInformationMetadata, InformationPage, informationPages } from '@/_pages/information';

const content = informationPages['how-to-use-berberine-patches'];

export const dynamic = 'force-static';
export const metadata = getInformationMetadata(content);

export default function HowToUseRoute() {
  return <InformationPage content={content}/>;
}
