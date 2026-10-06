import { Fragment } from 'react';

interface Props {
  text: string;
}

export const LineBreakText = (props: Props) => {
  const { text } = props;
  const lines = text.split(/<br\s*\/?>/i);

  return lines.map((line, index) => (
    <Fragment key={`${index}-${line}`}>
      {index > 0 && <br/>}
      {line.trim()}
    </Fragment>
  ));
};
