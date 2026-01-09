"""速率限制器 - 用于控制API调用频率"""

import time
import logging
from collections import deque
from typing import Optional

logger = logging.getLogger(__name__)


class RateLimiter:
	"""
	令牌桶速率限制器

	用于控制API调用频率，避免超过RPM/TPM限制
	"""

	def __init__(self, rpm: int, tpm: Optional[int] = None):
		"""
		Args:
			rpm: 每分钟请求数限制 (Requests Per Minute)
			tpm: 每分钟token数限制 (Tokens Per Minute)，可选
		"""
		self.rpm = rpm
		self.tpm = tpm
		self.request_times: deque = deque()
		self.token_consumptions: deque = deque()
		self.window = 60  # 60秒窗口

	def _clean_old_records(self) -> None:
		"""清理60秒窗口外的旧记录"""
		now = time.time()
		cutoff = now - self.window

		while self.request_times and self.request_times[0] < cutoff:
			self.request_times.popleft()

		while self.token_consumptions and self.token_consumptions[0][0] < cutoff:
			self.token_consumptions.popleft()

	def _get_current_rpm(self) -> int:
		"""获取当前窗口内的请求数"""
		self._clean_old_records()
		return len(self.request_times)

	def _get_current_tpm(self) -> int:
		"""获取当前窗口内的token消耗"""
		self._clean_old_records()
		return sum(tokens for _, tokens in self.token_consumptions)

	def _calculate_wait_time(self, estimated_tokens: int = 0) -> float:
		"""计算需要等待的时间"""
		self._clean_old_records()
		wait_time = 0.0

		# 检查RPM限制
		current_rpm = self._get_current_rpm()
		if current_rpm >= self.rpm:
			oldest_request = self.request_times[0]
			wait_for_rpm = oldest_request + self.window - time.time() + 0.1
			wait_time = max(wait_time, wait_for_rpm)

		# 检查TPM限制
		if self.tpm and estimated_tokens > 0:
			current_tpm = self._get_current_tpm()
			if current_tpm + estimated_tokens > self.tpm:
				if self.token_consumptions:
					oldest_consumption = self.token_consumptions[0][0]
					wait_for_tpm = oldest_consumption + self.window - time.time() + 0.1
					wait_time = max(wait_time, wait_for_tpm)

		return wait_time

	def acquire(self, estimated_tokens: int = 0) -> None:
		"""获取令牌（阻塞）"""
		wait_time = self._calculate_wait_time(estimated_tokens)

		if wait_time > 0:
			logger.info(
				f"触发速率限制，等待 {wait_time:.1f}s "
				f"(当前RPM: {self._get_current_rpm()}/{self.rpm})"
			)
			time.sleep(wait_time)

		now = time.time()
		self.request_times.append(now)

		if estimated_tokens > 0:
			self.token_consumptions.append((now, estimated_tokens))

	def can_proceed(self, estimated_tokens: int = 0) -> bool:
		"""检查是否可以立即执行请求（非阻塞）"""
		return self._calculate_wait_time(estimated_tokens) == 0

	def get_stats(self) -> dict:
		"""获取当前速率统计"""
		self._clean_old_records()
		return {
			"current_rpm": self._get_current_rpm(),
			"rpm_limit": self.rpm,
			"current_tpm": self._get_current_tpm() if self.tpm else None,
			"tpm_limit": self.tpm,
			"rpm_usage_pct": (self._get_current_rpm() / self.rpm * 100) if self.rpm else 0,
			"tpm_usage_pct": (self._get_current_tpm() / self.tpm * 100) if self.tpm else None,
		}
