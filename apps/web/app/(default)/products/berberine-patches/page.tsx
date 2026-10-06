import { getInformationMetadata, InformationPage, informationPages } from '@/_pages/information';

const content = informationPages['products/berberine-patches'];

export const dynamic = 'force-static';
export const metadata = getInformationMetadata(content);

export default function ProductRoute() {
  return <InformationPage content={content}/>;
}
