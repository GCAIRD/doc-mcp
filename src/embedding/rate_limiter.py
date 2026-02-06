"""Rate limiter - controls API call frequency"""

import time
import logging
from collections import deque
from typing import Optional

logger = logging.getLogger(__name__)


class RateLimiter:
	"""
	Token bucket rate limiter

	Controls API call frequency to avoid exceeding RPM/TPM limits
	"""

	def __init__(self, rpm: int, tpm: Optional[int] = None):
		"""
		Args:
			rpm: Requests per minute limit
			tpm: Tokens per minute limit (optional)
		"""
		self.rpm = rpm
		self.tpm = tpm
		self.request_times: deque = deque()
		self.token_consumptions: deque = deque()
		self.window = 60  # 60 second window

	def _clean_old_records(self) -> None:
		"""Clean records outside 60s window"""
		now = time.time()
		cutoff = now - self.window

		while self.request_times and self.request_times[0] < cutoff:
			self.request_times.popleft()

		while self.token_consumptions and self.token_consumptions[0][0] < cutoff:
			self.token_consumptions.popleft()

	def _get_current_rpm(self) -> int:
		"""Get current request count in window"""
		self._clean_old_records()
		return len(self.request_times)

	def _get_current_tpm(self) -> int:
		"""Get current token consumption in window"""
		self._clean_old_records()
		return sum(tokens for _, tokens in self.token_consumptions)

	def _calculate_wait_time(self, estimated_tokens: int = 0) -> float:
		"""Calculate required wait time"""
		self._clean_old_records()
		wait_time = 0.0

		# Check RPM limit
		current_rpm = self._get_current_rpm()
		if current_rpm >= self.rpm:
			oldest_request = self.request_times[0]
			wait_for_rpm = oldest_request + self.window - time.time() + 0.1
			wait_time = max(wait_time, wait_for_rpm)

		# Check TPM limit
		if self.tpm and estimated_tokens > 0:
			current_tpm = self._get_current_tpm()
			if current_tpm + estimated_tokens > self.tpm:
				if self.token_consumptions:
					oldest_consumption = self.token_consumptions[0][0]
					wait_for_tpm = oldest_consumption + self.window - time.time() + 0.1
					wait_time = max(wait_time, wait_for_tpm)

		return wait_time

	def acquire(self, estimated_tokens: int = 0) -> None:
		"""Acquire token (blocking)"""
		wait_time = self._calculate_wait_time(estimated_tokens)

		if wait_time > 0:
			logger.info(
				f"Rate limit triggered, waiting {wait_time:.1f}s "
				f"(current RPM: {self._get_current_rpm()}/{self.rpm})"
			)
			time.sleep(wait_time)

		now = time.time()
		self.request_times.append(now)

		if estimated_tokens > 0:
			self.token_consumptions.append((now, estimated_tokens))

	def can_proceed(self, estimated_tokens: int = 0) -> bool:
		"""Check if request can proceed immediately (non-blocking)"""
		return self._calculate_wait_time(estimated_tokens) == 0

	def get_stats(self) -> dict:
		"""Get current rate statistics"""
		self._clean_old_records()
		return {
			"current_rpm": self._get_current_rpm(),
			"rpm_limit": self.rpm,
			"current_tpm": self._get_current_tpm() if self.tpm else None,
			"tpm_limit": self.tpm,
			"rpm_usage_pct": (self._get_current_rpm() / self.rpm * 100) if self.rpm else 0,
			"tpm_usage_pct": (self._get_current_tpm() / self.tpm * 100) if self.tpm else None,
		}
