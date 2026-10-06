import styles from './styles.module.scss';

interface Question {
  question: string;
  answer: string;
}

interface Props {
  questions: Question[];
}

export const ProductFaq = ({ questions }: Props) => (
  <div className={styles.questionList}>
    {questions.map(item => (
      <details className={styles.question} key={item.question}>
        <summary>
          <span>{item.question}</span>
          <span className={styles.toggleIcon} aria-hidden='true'/>
        </summary>
        <p>{item.answer}</p>
      </details>
    ))}
  </div>
);
