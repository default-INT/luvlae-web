import { getInformationMetadata, InformationPage, informationPages } from '@/_pages/information';

const content = informationPages['berberine-patch-safety'];

export const dynamic = 'force-static';
export const metadata = getInformationMetadata(content);

export default function SafetyRoute() {
  return <InformationPage content={content}/>;
}
