import { getInformationMetadata, InformationPage, informationPages } from '@/_pages/information';

const content = informationPages.ingredients;

export const dynamic = 'force-static';
export const metadata = getInformationMetadata(content);

export default function IngredientsRoute() {
  return <InformationPage content={content}/>;
}
