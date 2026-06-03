import { BadRequestException } from '@nestjs/common';

const supportedBestOf = new Set([1, 3, 5]);

function getBestOfValue(bestOf?: string | null) {
  if (!bestOf) return 1;

  const normalized = bestOf.trim().toUpperCase();
  const match = normalized.match(/^BO([135])$/);

  if (!match) {
    throw new BadRequestException('Unsupported best-of format');
  }

  const value = Number(match[1]);

  if (!supportedBestOf.has(value)) {
    throw new BadRequestException('Unsupported best-of format');
  }

  return value;
}

function formatValidScores(winsRequired: number) {
  return Array.from({ length: winsRequired }, (_, loserScore) => {
    return `${winsRequired}-${loserScore}`;
  }).join(', ');
}

export function validateBestOfScore(
  bestOf: string | null | undefined,
  scoreA: number,
  scoreB: number,
) {
  const bestOfValue = getBestOfValue(bestOf);
  const winsRequired = Math.floor(bestOfValue / 2) + 1;
  const winnerScore = Math.max(scoreA, scoreB);
  const loserScore = Math.min(scoreA, scoreB);

  if (scoreA === scoreB) {
    throw new BadRequestException('Draw result is not allowed');
  }

  if (winnerScore !== winsRequired || loserScore >= winsRequired) {
    throw new BadRequestException(
      `BO${bestOfValue} result must be one of: ${formatValidScores(
        winsRequired,
      )}`,
    );
  }
}

export function normalizeBestOf(bestOf?: string | null) {
  const bestOfValue = getBestOfValue(bestOf);
  return `BO${bestOfValue}`;
}
