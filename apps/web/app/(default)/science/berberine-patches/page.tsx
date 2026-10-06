import { getInformationMetadata, InformationPage, informationPages } from '@/_pages/information';

const content = informationPages['science/berberine-patches'];

export const dynamic = 'force-static';
export const metadata = getInformationMetadata(content);

export default function ScienceRoute() {
  return <InformationPage content={content}/>;
}
