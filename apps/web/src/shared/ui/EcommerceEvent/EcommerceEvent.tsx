'use client';

import { useEffect, useRef } from 'react';

import { trackEcommerceEvent } from '@/shared/lib/analytics';

import type { EcommerceEventName, EcommerceParameters } from '@/shared/lib/analytics';

interface Props { name: EcommerceEventName; parameters: EcommerceParameters; onceKey?: string }

export const EcommerceEvent = (props: Props) => {
  const { name, parameters, onceKey } = props;
  const sent = useRef(false);

  useEffect(() => {
    if (!sent.current) sent.current = trackEcommerceEvent(name, parameters, onceKey);
  }, [name, parameters, onceKey]);

  return null;
};
