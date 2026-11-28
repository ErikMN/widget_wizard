/* Panel styling and icon adapted from Axis media-stream-player v13.3.3.
 * Copyright (c) 2018-2023 Axis Communications AB
 * Licensed under the MIT License. See web/public/LICENSE.axis.txt.
 */
import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { getStreamStats } from './streamStats';
import type { StreamFormat, StreamMetrics } from './types';

const StatsWrapper = styled.div`
  position: absolute;
  top: 24px;
  left: 24px;
  width: 360px;
  min-width: 240px;
  max-width: 80%;
  max-height: 80%;
  border-radius: 4px;
  background: #292929 0% 0% no-repeat padding-box;
  opacity: 0.88;
`;

const StatsHeader = styled.div`
  padding: 8px 24px;
  border-bottom: 1px solid #525252;
`;

const StatsIcon = styled.span<{ readonly $clickable: boolean }>`
  width: 24px;
  height: 24px;
  float: left;
  cursor: ${({ $clickable }) => ($clickable ? 'pointer' : 'default')};

  & > svg {
    fill: #e0e0e0;
  }
`;

const StatsTitle = styled.span`
  display: inline-block;
  margin-left: 8px;
  vertical-align: sub;
  text-align: left;
  font-size: 16px;
  font-family: 'Open Sans', Sans-Serif;
  line-height: 22px;
  color: #f5f5f5;
`;

const StatsHide = styled.span`
  float: right;
  text-align: right;
`;

const HideLink = styled.a`
  vertical-align: sub;
  text-decoration: none;
  font-size: 16px;
  font-family: 'Open Sans', Sans-Serif;
  line-height: 22px;
  color: #b8b8b8;
`;

const Data = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  column-gap: 24px;
  row-gap: 16px;
  width: 100%;
  padding: 16px 24px 24px;
`;

const StatItem = styled.div`
  text-align: left;
  font-family: 'Open Sans', Sans-Serif;
`;

const StatName = styled.div`
  font-size: 12px;
  line-height: 17px;
  color: #b8b8b8;
`;

const StatValue = styled.div`
  font-size: 13px;
  line-height: 18px;
  color: #e0e0e0;
`;

const StatsShow = styled.div`
  position: absolute;
  top: 24px;
  left: 24px;
  width: 32px;
  height: 32px;
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 4px;
  background: #292929 0% 0% no-repeat padding-box;
  opacity: 0.88;
`;

const StatsGlyph = ({ title }: { readonly title?: string }) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      {title !== undefined ? <title>{title}</title> : null}
      <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" />
    </svg>
  );
};

interface StreamStatsProps {
  readonly format: StreamFormat;
  readonly width: number;
  readonly height: number;
  readonly refresh: number;
  readonly volume?: number;
  readonly readMetrics: () => StreamMetrics;
  readonly expanded: boolean;
  readonly onToggleExpanded: (value: boolean) => void;
}

const StatsData = ({
  format,
  width,
  height,
  refresh,
  volume,
  readMetrics
}: Omit<StreamStatsProps, 'expanded' | 'onToggleExpanded'>) => {
  const [metrics, setMetrics] = useState<StreamMetrics>({});

  useEffect(() => {
    const update = () => setMetrics(readMetrics());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [readMetrics]);

  const stats = getStreamStats(format, width, height, refresh, volume, metrics);

  return (
    <Data>
      {stats.map((stat) => (
        <StatItem key={stat.name}>
          <StatName>{stat.name}</StatName>
          <StatValue>{`${stat.value} ${stat.unit ?? ''}`}</StatValue>
        </StatItem>
      ))}
    </Data>
  );
};

export const StreamStats: React.FC<StreamStatsProps> = ({
  expanded,
  onToggleExpanded,
  ...props
}) => {
  const toggle = (event: React.MouseEvent) => {
    event.preventDefault();
    onToggleExpanded(!expanded);
  };

  return expanded ? (
    <StatsWrapper>
      <StatsHeader>
        <StatsIcon $clickable={false}>
          <StatsGlyph />
        </StatsIcon>
        <StatsTitle>Client stream data</StatsTitle>
        <StatsHide>
          <HideLink href="" onClick={toggle}>
            Hide
          </HideLink>
        </StatsHide>
      </StatsHeader>
      <StatsData {...props} />
    </StatsWrapper>
  ) : (
    <StatsShow>
      <StatsIcon onClick={toggle} $clickable={true}>
        <StatsGlyph title="Show client stream data" />
      </StatsIcon>
    </StatsShow>
  );
};
