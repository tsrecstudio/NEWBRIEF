// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QuestionRenderer } from '../src/client/components/QuestionRenderer';
import type { BriefQuestion, QuestionAnswerValue } from '../src/shared/types';

describe('Interactive QuestionRenderer Mechanics (Client UX)', () => {
  it('handles "like_or_not" ("Похоже на то или нет") hypothesis voting', () => {
    const onChange = vi.fn();
    const q: BriefQuestion = {
      id: 'q-like',
      sectionId: 's1',
      type: 'like_or_not',
      title: 'Похоже ли это на ваши процессы?',
      architectureImpact: 'Определяет модель событий',
      statements: [
        { id: 'st1', text: 'Сменные отчёты сводятся вручную в Excel' },
      ],
    };

    render(
      <QuestionRenderer
        question={q}
        questionIndex={0}
        totalQuestions={5}
        answer={undefined}
        attachments={[]}
        downloadBaseUrl="/api/public/briefs/tok/files"
        onChange={onChange}
        onUploadFiles={async () => {}}
        onDeleteFile={async () => {}}
      />
    );

    fireEvent.click(screen.getByText('✓ В точку'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        statementVotes: { st1: 'yes' },
        skipped: false,
      })
    );
  });

  it('handles "spectrum" ("Что ближе — что дальше") bipolar dilemma scale', () => {
    const onChange = vi.fn();
    const q: BriefQuestion = {
      id: 'q-spec',
      sectionId: 's1',
      type: 'spectrum',
      title: 'Стратегия запуска',
      architectureImpact: 'Монолит vs микросервисы',
      spectrum: {
        leftTitle: 'Быстрый пилот MVP',
        rightTitle: 'Полная целевая платформа',
      },
    };

    render(
      <QuestionRenderer
        question={q}
        questionIndex={1}
        totalQuestions={5}
        answer={undefined}
        attachments={[]}
        downloadBaseUrl="/api/public/briefs/tok/files"
        onChange={onChange}
        onUploadFiles={async () => {}}
        onDeleteFile={async () => {}}
      />
    );

    fireEvent.click(screen.getByText('4'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        spectrumValue: 4,
      })
    );
  });

  it('handles "multi_choice" checkboxes and custom system tag addition', () => {
    let latestAnswer: QuestionAnswerValue = {};
    const onChange = vi.fn((next: QuestionAnswerValue) => {
      latestAnswer = next;
    });

    const q: BriefQuestion = {
      id: 'q-multi',
      sectionId: 's1',
      type: 'multi_choice',
      title: 'Интеграции',
      architectureImpact: 'Шина обмена',
      allowCustomOption: true,
      options: [
        { id: '1c', label: '1С:ERP 2.5' },
        { id: 'scada', label: 'SCADA / OPC UA' },
      ],
    };

    const { rerender } = render(
      <QuestionRenderer
        question={q}
        questionIndex={2}
        totalQuestions={5}
        answer={latestAnswer}
        attachments={[]}
        downloadBaseUrl="/api/public/briefs/tok/files"
        onChange={onChange}
        onUploadFiles={async () => {}}
        onDeleteFile={async () => {}}
      />
    );

    fireEvent.click(screen.getByText('1С:ERP 2.5'));
    expect(latestAnswer.selectedOptionIds).toEqual(['1c']);

    rerender(
      <QuestionRenderer
        question={q}
        questionIndex={2}
        totalQuestions={5}
        answer={latestAnswer}
        attachments={[]}
        downloadBaseUrl="/api/public/briefs/tok/files"
        onChange={onChange}
        onUploadFiles={async () => {}}
        onDeleteFile={async () => {}}
      />
    );

    const customInput = screen.getByPlaceholderText(
      /Вписать свою систему/i
    );
    fireEvent.change(customInput, { target: { value: 'Самописная WMS на Delphi' } });
    fireEvent.click(screen.getByText('Добавить'));

    expect(latestAnswer.customOptions).toEqual(['Самописная WMS на Delphi']);
  });

  it('handles "priority_matrix" bucket assignment and "long_text" quick hints', () => {
    const onChange = vi.fn();
    const matrixQ: BriefQuestion = {
      id: 'q-mat',
      sectionId: 's1',
      type: 'priority_matrix',
      title: 'Очерёдность модулей',
      architectureImpact: 'Границы MVP',
      buckets: [
        { id: 'mvp', label: 'В MVP', tone: 'primary' },
        { id: 'later', label: '2 этап', tone: 'secondary' },
      ],
      items: [{ id: 'item-mes', label: 'Диспетчеризация смен' }],
    };

    const { unmount } = render(
      <QuestionRenderer
        question={matrixQ}
        questionIndex={3}
        totalQuestions={5}
        answer={undefined}
        attachments={[]}
        downloadBaseUrl="/api/public/briefs/tok/files"
        onChange={onChange}
        onUploadFiles={async () => {}}
        onDeleteFile={async () => {}}
      />
    );

    fireEvent.click(screen.getByText('В MVP'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        bucketAssignments: { 'item-mes': 'mvp' },
      })
    );
    unmount();

    const onTextChange = vi.fn();
    const textQ: BriefQuestion = {
      id: 'q-txt',
      sectionId: 's1',
      type: 'long_text',
      title: 'Критерий успеха',
      architectureImpact: 'Целевые SLA',
      quickHints: ['Уход от ручного Excel'],
    };

    render(
      <QuestionRenderer
        question={textQ}
        questionIndex={4}
        totalQuestions={5}
        answer={undefined}
        attachments={[]}
        downloadBaseUrl="/api/public/briefs/tok/files"
        onChange={onTextChange}
        onUploadFiles={async () => {}}
        onDeleteFile={async () => {}}
      />
    );

    fireEvent.click(screen.getByText('+ Уход от ручного Excel'));
    expect(onTextChange).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Уход от ручного Excel',
      })
    );
  });
});
